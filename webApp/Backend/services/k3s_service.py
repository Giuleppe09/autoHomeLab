import os
import subprocess
import yaml
from daos.k3s_dao import K3sDAO

class K3sService:
    @staticmethod
    def save_k3s_parameters(data):
        dao = K3sDAO()
        
        subnet_suffix = "/24"
        def format_ip(ip):
            if not ip: return ""
            ip = str(ip).strip()
            return ip if "/" in ip else ip + subnet_suffix

        vars_data = {
            "k3s_server_vmid": 101,
            "k3s_server_hostname": "K3s-Server",
            "k3s_server_ip": format_ip(data.get('k3s_server_ip')),
            "k3s_server_gw": data.get('gateway'),
            "k3s_agent_vmid": 102,
            "k3s_agent_hostname": "K3s-Agent",
            "k3s_agent_ip": format_ip(data.get('k3s_agent_ip')),
            "k3s_agent_gw": data.get('gateway'),
            "k3s_user": data.get('k3s_user')
        }
        
        secrets_data = {
            "k3s_password": data.get('k3s_password')
        }
        
        dao.save_k3s_config(vars_data, secrets_data)

    @staticmethod
    def execute_k3s_setup_stream(pve_ip):
        dao = K3sDAO()
        scripts_path = os.path.join(dao.k3s_dir, "script")
        inventory_path = os.path.join(dao.k3s_dir, "inventory.ini")
        
        # Se pve_ip non è in sessione, proviamo a leggerla dal vars.yml di k3s
        if not pve_ip:
            try:
                vars_path = os.path.join(dao.k3s_dir, "vars.yml")
                if os.path.exists(vars_path):
                    with open(vars_path, 'r') as f:
                        k3s_vars = yaml.safe_load(f) or {}
                        pve_ip = k3s_vars.get('proxmox_api_host')
            except Exception:
                pass

        if not pve_ip:
            yield "\n❌ Errore: IP del nodo Proxmox non trovato. Esegui nuovamente il setup dall'inizio.\n"
            return
            
        with open(inventory_path, 'w') as f:
            f.write(f"[proxmox]\nproxmox ansible_host={pve_ip} ansible_user=root ansible_ssh_common_args='-o StrictHostKeyChecking=no'\n\n")
            
        playbooks = ["0_create_cloudinit_template.yml", "2_deploy_k3s_vms.yml"]
        
        for pb in playbooks:
            pb_path = os.path.join(scripts_path, pb)
            yield f"\n\n▶️ Esecuzione di: {pb}...\n{'-'*40}\n"
            cmd = ["ansible-playbook", "-i", inventory_path, pb_path]
            process = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1)
            for line in iter(process.stdout.readline, ''):
                yield line
            process.stdout.close()
            process.wait()
            if process.returncode != 0:
                yield f"\n❌ Errore durante l'esecuzione di {pb} (Codice: {process.returncode}). Setup interrotto.\n"
                break
        else:
            yield "\n✅ Playbook eseguiti con successo!\n"