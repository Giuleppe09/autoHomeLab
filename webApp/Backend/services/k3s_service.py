import os
import subprocess
import yaml
import json
from daos.k3s_dao import K3sDAO
from services.inventory_service import InventoryService

class K3sService:
    @staticmethod
    def save_k3s_parameters(data):
        dao = K3sDAO()
        
        def format_ip(ip):
            if not ip: return ""
            ip = str(ip).strip()
            return ip if "/" in ip else ip + "/24"

        vars_data = {
            "k3s_server_hostname": "K3s-Server",
            "k3s_server_vmid": None,
            "k3s_server_ip": format_ip(data.get('k3s_server_ip')),
            "k3s_server_gw": data.get('gateway'),
            "k3s_agent_hostname": "K3s-Agent",
            "k3s_agent_vmid": None,
            "k3s_agent_ip": format_ip(data.get('k3s_agent_ip')),
            "k3s_agent_gw": data.get('gateway'),
            "k3s_user": data.get('k3s_user'),
            "k3s_template_storage": data.get('k3s_template_storage'),
            "k3s_disk_storage": data.get('k3s_disk_storage')
        }
        
        # Rimossa la nextcloud_password
        secrets_data = {
            "k3s_password": data.get('k3s_password')
        }
        
        dao.save_k3s_config(vars_data, secrets_data)

    @staticmethod
    def execute_k3s_setup_stream(pve_ip):
        dao = K3sDAO()
        scripts_path = os.path.join(dao.k3s_dir)
        vars_path = os.path.join(dao.arch_dir, "vars.yml")
        
        if not pve_ip:
            try:
                if os.path.exists(vars_path):
                    with open(vars_path, 'r') as f:
                        k3s_vars = yaml.safe_load(f) or {}
                        pve_ip = k3s_vars.get('proxmox_api_host')
            except Exception:
                pass

        inventory_path = InventoryService.generate_inventory(pve_ip)
        if not inventory_path:
            yield json.dumps({"success": False, "log": "\n❌ Errore: Impossibile generare l'inventory globale.\n"}) + "\n"
            return
            
        # Rimosso il playbook 5 (Nextcloud), K3s si ferma al Provisioner Storage!
        playbooks = [
            "1_create_cloudinit_template.yml", 
            "2_deploy_k3s_vms.yml",
            "3_install_k3s_cluster.yml",
            "4_install_nfs_provisioner.yml"
        ]
        
        env = os.environ.copy()
        env["ANSIBLE_HOST_KEY_CHECKING"] = "False"
        env["PYTHONUNBUFFERED"] = "1"
        
        for pb in playbooks:
            pb_path = os.path.join(scripts_path, pb)
            yield json.dumps({"log": f"\n\n▶️ Esecuzione di: {pb}...\n{'-'*40}\n"}) + "\n"
            
            cmd = ["ansible-playbook", "-i", inventory_path, pb_path]
            process = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1, env=env)
            
            for line in iter(process.stdout.readline, ''):
                yield json.dumps({"log": line}) + "\n"
                
            process.stdout.close()
            process.wait()
            
            if process.returncode != 0:
                yield json.dumps({"success": False, "log": f"\n❌ Errore in {pb} (Codice: {process.returncode}). Setup interrotto.\n"}) + "\n"
                break
        else:
            yield json.dumps({"success": True, "log": "\n✅ Cluster K3s e Astrazione Storage completati con successo!\n"}) + "\n"