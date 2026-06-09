import os
import subprocess
import requests
import json
import urllib3
import yaml
from services.inventory_service import InventoryService

# Disabilita i warning per i certificati SSL autofirmati di Proxmox
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

class ProxmoxService:

    def check_status(self, pve_ip):
        """Verifica se il nodo Proxmox è online tramite un ping."""
        if not pve_ip:
            return False
            
        import platform
        ping_cmd = ['ping', '-c', '1', '-W', '1', pve_ip]
        if platform.system() == "Windows":
            ping_cmd = ['ping', '-n', '1', '-w', '1000', pve_ip]
            
        result = subprocess.run(ping_cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        return result.returncode == 0

    def init_connection(self, pve_ip, base_dir):
        """Esegue i playbook iniziali di connessione e setup autenticazione."""
        inventory_path = InventoryService.generate_inventory(pve_ip)
        if not inventory_path:
            raise Exception("Impossibile generare l'inventory Ansible centralizzato.")

        playbooks = [
            "../../architecture/connection/00_get_proxmox_info.yml",
            "../../architecture/connection/0_setup_auth.yml"
        ]

        for playbook in playbooks:
            playbook_path = os.path.abspath(os.path.join(base_dir, playbook))
            
            result = subprocess.run(
                ['ansible-playbook', '-i', inventory_path, playbook_path],
                capture_output=True,
                text=True
            )
            
            if result.returncode != 0:
                raise Exception(f"Fallimento nello script {os.path.basename(playbook)}:\n{result.stderr}\n{result.stdout}")

    def get_detailed_storages(self):
        """
        Esegue lo script Ansible per interrogare gli storage tramite CLI (pvesh)
        e restituisce i dettagli di capacità totale e disponibile, divisi per tipologia.
        """
        base_dir = os.path.dirname(os.path.abspath(__file__))
        architecture_path = os.path.abspath(os.path.join(base_dir, "..", "..", "..", "architecture"))
        vars_path = os.path.join(architecture_path, "vars.yml")
        
        try:
            with open(vars_path, 'r') as f:
                vars_data = yaml.safe_load(f) or {}
            
            pve_host = vars_data.get('proxmox_api_host')
            
            if not pve_host:
                return {"success": False, "error": "IP Proxmox non trovato in vars.yml", "template_storages": [], "disk_storages": []}

            # 1. Eseguiamo il playbook Ansible in SSH per evitare i blocchi della porta 8006
            inventory_path = InventoryService.generate_inventory(pve_host)
            playbook_path = os.path.join(architecture_path, "connection", "01_get_storages.yml")
            
            result = subprocess.run(
                ['ansible-playbook', '-i', inventory_path, playbook_path],
                capture_output=True,
                text=True
            )
            
            if result.returncode != 0:
                err_msg = result.stderr if result.stderr else result.stdout
                return {"success": False, "error": f"Fallimento script Ansible:\n{err_msg}", "template_storages": [], "disk_storages": []}

            # 2. Leggiamo il JSON esportato
            storages_file = os.path.abspath(os.path.join(architecture_path, "..", "proxmox_storages.json"))
            with open(storages_file, 'r') as f:
                raw_storages = json.load(f)
            
            template_storages = []
            disk_storages = []
            
            for s in raw_storages:
                if s.get('active') == 1:
                    total_bytes = s.get('total', s.get('size', 0))
                    
                    # Calcolo Proxmox GUI (Base 10, ignora 5% system reserve per la root)
                    used_bytes = s.get('used', 0)
                    if used_bytes > 0:
                        free_bytes = total_bytes - used_bytes
                    else:
                        free_bytes = s.get('avail', 0)
                    
                    total_gb = round(total_bytes / (1000 ** 3), 1)
                    free_gb = round(free_bytes / (1000 ** 3), 1)
                    
                    storage_info = {
                        "name": s['storage'],
                        "type": s['type'],
                        "total_gb": total_gb,
                        "free_gb": free_gb
                    }
                    
                    content = s.get('content', '')
                    if 'vztmpl' in content:
                        template_storages.append(storage_info)
                    if 'rootdir' in content:
                        disk_storages.append(storage_info)
            
            return {
                "success": True, 
                "template_storages": template_storages,
                "disk_storages": disk_storages
            }
            
        except Exception as e:
            return {"success": False, "error": f"Errore Proxmox API: {str(e)}", "template_storages": [], "disk_storages": []}