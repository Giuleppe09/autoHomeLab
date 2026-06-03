import os
import subprocess
import json
import platform

class ProxmoxService:
    @staticmethod
    def check_status(pve_ip):
        if not pve_ip:
            return False
            
        ping_cmd = ['ping', '-c', '1', '-W', '1', pve_ip]
        if platform.system() == "Windows":
            ping_cmd = ['ping', '-n', '1', '-w', '1000', pve_ip]
            
        result = subprocess.run(ping_cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        return result.returncode == 0
    
    @staticmethod
    def discover_storages_sync(pve_ip, base_dir, tags=None):
        """Esegue Ansible in background in modo bloccante per creare il file JSON degli storage."""
        if pve_ip == "test":
            print("🚀 Simulazione discovery Proxmox (Modalità Test)")
            json_path = os.path.abspath(os.path.join(base_dir, '..', '..', 'architecture', 'proxmox_info.json'))
            with open(json_path, 'w') as f:
                json.dump({"template_storages": ["local (TEST)"], "disk_storages": ["local-lvm (TEST)"]}, f)
            return
        
        print(f"Avvio discovery storages Proxmox sincrona per IP: {pve_ip} con tags: {tags}")
        script_dir = os.path.abspath(os.path.join(base_dir, '..', '..', 'architecture', 'tailscale', 'script'))
        playbook_path = os.path.join(script_dir, '00_get_proxmox_info.yml')
        
        ansible_cmd = [
            'ansible-playbook', '-i', 'proxmox,', playbook_path,
            '-e', f"ansible_host={pve_ip}", '-e', "ansible_user=root"
        ]
        
        # Se passiamo tags (es. per aggiornare solo gli storage)
        if tags:
            ansible_cmd.extend(['--tags', tags])
        
        # Esecuzione bloccante senza stream
        process = subprocess.run(ansible_cmd, cwd=script_dir, capture_output=True, text=True)
        
        if process.returncode != 0:
            raise Exception(f"Errore durante l'esecuzione del Playbook Ansible: {process.stderr or process.stdout}")
        
    @staticmethod
    def read_storages(base_dir):
        """Legge il file JSON generato dallo script Ansible."""
        # Il file viene salvato nella root 'architecture' per essere accessibile a tutti i moduli
        json_path = os.path.abspath(os.path.join(base_dir, '..', '..', 'architecture', 'proxmox_info.json'))
        try:
            print(f"Leggo le info di Proxmox da: {json_path}")
            if not os.path.exists(json_path):
                raise Exception("Il file JSON di Proxmox non esiste. Esegui prima la discovery.")
            with open(json_path, 'r') as f: 
                return json.load(f)
        except Exception as e:
            raise Exception(f"Errore lettura JSON di discovery: {str(e)}")