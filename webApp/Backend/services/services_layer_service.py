import os
import subprocess
import json
from daos.k3s_dao import K3sDAO

class ServicesLayerService:
    
    @staticmethod
    def save_nextcloud_config(data):
        """Smista i dati del payload dinamico per salvarli nei file di configurazione"""
        dao = K3sDAO()
        
        vars_data = {}
        secrets_data = {}
        
        for key, value in data.items():
            if "password" in key.lower() or "secret" in key.lower():
                secrets_data[key] = value
            else:
                vars_data[key] = value
        
        dao.save_k3s_config(vars_data, secrets_data)

    @staticmethod
    def execute_nextcloud_stream(inventory_path):
        """Esegue in streaming il playbook di Nextcloud e calcola l'URL finale"""
        dao = K3sDAO()
        playbook_path = os.path.join(dao.arch_dir, "services", "deploy_nextcloud.yml")
        
        if not inventory_path:
            yield json.dumps({"success": False, "log": "\n❌ Errore: inventory path mancante.\n"}) + "\n"
            return

        # Recuperiamo l'IP dell'agent per calcolare l'URL di Nextcloud
        vars_data, _ = dao.get_k3s_config()
        agent_ip_raw = vars_data.get('k3s_agent_ip', '127.0.0.1/24')
        agent_ip = agent_ip_raw.split('/')[0]
        nextcloud_url = f"http://{agent_ip}:30080"

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
            # Inviamo l'URL all'interno della risposta di successo
            yield json.dumps({
                "success": True, 
                "url": nextcloud_url, 
                "log": f"\n✅ Nextcloud distribuito con successo nel cluster!\n🚀 Servizio raggiungibile su: {nextcloud_url}\n"
            }) + "\n"
        else:
            yield json.dumps({"success": False, "log": f"\n❌ Errore nel Deployment applicativo. Codice errore: {process.returncode}\n"}) + "\n"