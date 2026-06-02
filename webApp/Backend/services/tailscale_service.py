import subprocess
import os
import json
from daos.tailscale_dao import TailscaleDAO

class TailscaleService:
    def __init__(self):
        self.dao = TailscaleDAO()
        self.scripts_path = os.path.join(self.dao.base_path, "script")

    def save_parameters(self, data):
        return self.dao.save_config(data)

    def execute_setup_stream(self, pve_ip):
        # Creazione dinamica dell'inventory Ansible per agganciare gli IP corretti
        inventory_path = os.path.abspath(os.path.join(self.scripts_path, "..", "inventory.ini"))
        vars_path = os.path.abspath(os.path.join(self.scripts_path, "..", "..", "vars.yml"))
        
        lxc_ip = None
        try:
            with open(vars_path, 'r') as f:
                for line in f:
                    if line.startswith('lxc_ip:'):
                        lxc_ip = line.split(':', 1)[1].strip().strip('"').strip("'").split('/')[0]
                        break
        except Exception as e:
            yield json.dumps({"success": False, "log": f"\n❌ Errore durante la lettura del file di configurazione vars.yml: {str(e)}\n"}) + "\n"
            return
            
        if not lxc_ip:
            yield json.dumps({"success": False, "log": "\n❌ Errore: L'IP del container LXC non è stato trovato. Assicurati di aver salvato correttamente la configurazione nello step precedente.\n"}) + "\n"
            return

        with open(inventory_path, 'w') as f:
            f.write(f"[proxmox]\nproxmox ansible_host={pve_ip} ansible_user=root ansible_ssh_common_args='-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=10'\n\n")
            f.write(f"[tailscale_lxc]\ntailscale_lxc ansible_host={lxc_ip} ansible_user=root ansible_ssh_common_args='-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=10'\n")

        # Eseguiamo i 4 script in sequenza
        playbooks = ["0_setup_auth.yml", "1_create_lxc.yml", "2_install_tailscale.yml", "3_setup_local_pc.yml"]
        
        env = os.environ.copy()
        env["ANSIBLE_HOST_KEY_CHECKING"] = "False"
        env["PYTHONUNBUFFERED"] = "1"
        
        for pb in playbooks:
            pb_path = os.path.join(self.scripts_path, pb)
            yield json.dumps({"log": f"\n\n▶️ Esecuzione di: {pb}...\n{'-'*40}\n"}) + "\n"
            cmd = ["ansible-playbook", "-i", inventory_path, pb_path]
            process = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1, env=env)
            for line in iter(process.stdout.readline, ''):
                yield json.dumps({"log": line}) + "\n"
            process.stdout.close()
            process.wait()
            if process.returncode != 0:
                yield json.dumps({"success": False, "log": f"\n❌ Errore durante l'esecuzione di {pb} (Codice: {process.returncode}). Setup interrotto.\n"}) + "\n"
                break
        else:
            yield json.dumps({"success": True, "log": "\n✅ Tutti i playbook sono stati eseguiti con successo!\n"}) + "\n"