import os
import subprocess
import yaml
import json
from daos.k3s_dao import K3sDAO
from services.inventory_service import InventoryService

class ServicesLayerService:
    
    @staticmethod
    def save_nextcloud_config(username, password):
        """Smista l'username in vars.yml globale e la password in secrets.yml"""
        dao = K3sDAO()
        
        vars_data = {
            "nextcloud_admin_user": username
        }
        secrets_data = {
            "nextcloud_admin_password": password
        }
        
        dao.save_k3s_config(vars_data, secrets_data)

    @staticmethod
    def execute_nextcloud_stream():
        """Aggiorna l'inventory globale ed esegue in streaming il playbook di Nextcloud dal path aggiornato"""
        dao = K3sDAO()
        
        # --- PATH AGGIORNATI IN BASE ALLA TUA NUOVA STRUTTURA ---
        # dao.arch_dir punta a "architecture"
        # Andiamo a prendere il file "deploy_nextcloud.yml" dentro la cartella "services"
        playbook_path = os.path.join(dao.arch_dir, "services", "deploy_nextcloud.yml")
        vars_path = os.path.join(dao.arch_dir, "vars.yml")
        
        pve_ip = None
        try:
            if os.path.exists(vars_path):
                with open(vars_path, 'r') as f:
                    vars_yaml = yaml.safe_load(f) or {}
                    pve_ip = vars_yaml.get('proxmox_api_host')
        except Exception:
            pass

        inventory_path = InventoryService.generate_inventory(pve_ip)
        if not inventory_path:
            yield json.dumps({"success": False, "log": "\n❌ Errore: Impossibile rigenerare l'inventory globale.\n"}) + "\n"
            return

        env = os.environ.copy()
        env["ANSIBLE_HOST_KEY_CHECKING"] = "False"
        env["PYTHONUNBUFFERED"] = "1"

        yield json.dumps({"log": "\n▶️ Esecuzione del Playbook Ansible per Nextcloud...\n" + "-"*50 + "\n"}) + "\n"
        
        cmd = ["ansible-playbook", "-i", inventory_path, playbook_path]
        process = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1, env=env)
        
        for line in iter(process.stdout.readline, ''):
            yield json.dumps({"log": line}) + "\n"
            
        process.stdout.close()
        process.wait()
        
        if process.returncode == 0:
            yield json.dumps({"success": True, "log": "\n✅ Nextcloud distribuito con successo nel cluster!\n"}) + "\n"
        else:
            yield json.dumps({"success": False, "log": f"\n❌ Errore nel Deployment applicativo. Codice errore: {process.returncode}\n"}) + "\n"