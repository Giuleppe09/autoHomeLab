import os
import subprocess
import yaml
import json
from daos.nfs_dao import NfsDAO

class NfsService:
    @staticmethod
    def save_nfs_parameters(data):
        dao = NfsDAO()
        
        nfs_network = data.get('nfs_network', '192.168.1.0/24')
        subnet_suffix = "/24"
        if "/" in nfs_network:
            subnet_suffix = "/" + nfs_network.split("/")[1]
            
        def format_ip(ip):
            if not ip:
                return ""
            ip = str(ip).strip()
            return ip if "/" in ip else ip + subnet_suffix

        vars_data = {
            "nfs_vmid": data.get('nfs_vmid'),
            "nfs_hostname": data.get('nfs_hostname'),
            "nfs_ip": format_ip(data.get('nfs_ip')),
            "nfs_gw": data.get('gateway'),
            "nfs_network": nfs_network,
            "host_mount_path": data.get('host_mount_path'),
            "lxc_mount_path": data.get('lxc_mount_path')
        }
        
        secrets_data = {}
        
        dao.save_nfs_config(vars_data, secrets_data)

        # Generiamo l'inventory fisicamente subito dopo aver salvato la configurazione
        NfsService.generate_inventory()

    @staticmethod
    def execute_nfs_setup_stream(pve_ip):
        dao = NfsDAO()
        scripts_path = os.path.join(dao.arch_dir, "nfs")
        inventory_path = os.path.join(scripts_path, "inventory.ini")
        
        nfs_lxc_ip = None
        try:
            vars_path = os.path.join(dao.arch_dir, "vars.yml")
            if os.path.exists(vars_path):
                with open(vars_path, 'r') as f:
                    ts_vars = yaml.safe_load(f) or {}
                    if not pve_ip:
                        pve_ip = ts_vars.get('proxmox_api_host')
                    nfs_ip_cidr = ts_vars.get('nfs_ip', '')
                    nfs_lxc_ip = nfs_ip_cidr.split('/')[0] if '/' in nfs_ip_cidr else nfs_ip_cidr
        except Exception:
            pass

        if not pve_ip:
            yield json.dumps({"success": False, "log": "\n❌ Errore: IP del nodo Proxmox non trovato. Esegui nuovamente il setup dall'inizio.\n"}) + "\n"
            return
            
        if not nfs_lxc_ip:
            yield json.dumps({"success": False, "log": "\n❌ Errore: L'IP del container NFS non è stato trovato nel file vars.\n"}) + "\n"
            return
            
        with open(inventory_path, 'w') as f:
            f.write(f"[proxmox]\nproxmox ansible_host={pve_ip} ansible_user=root ansible_ssh_common_args='-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=10'\n\n")
            f.write(f"[nfs_lxc]\nnfs_lxc ansible_host={nfs_lxc_ip} ansible_user=root ansible_ssh_common_args='-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=10'\n")
        # Assicura che l'inventory file sia aggiornato prima del play
        NfsService.generate_inventory(pve_ip)
            
        playbooks = ["1_create_nfs_lxc.yml", "2_configure_nfs.yml"]
        
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
                yield json.dumps({"success": False, "log": f"\n❌ Errore durante l'esecuzione di {pb} (Codice: {process.returncode}). Setup interrotto.\n"}) + "\n"
                return
        else:
            yield json.dumps({"success": True, "log": "\n✅ Tutti i playbook NFS sono stati eseguiti con successo!\n"}) + "\n"