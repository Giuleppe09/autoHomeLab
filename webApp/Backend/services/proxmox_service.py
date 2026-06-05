import os
import requests
import urllib3
import yaml

# Disabilita i warning per i certificati SSL autofirmati di Proxmox
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

class ProxmoxService:
    @staticmethod
    def get_detailed_storages():
        """
        Interroga l'API di Proxmox e restituisce i dettagli di capacità
        totale e disponibile per ogni storage attivo.
        """
        base_dir = os.path.dirname(os.path.abspath(__file__))
        vars_path = os.path.abspath(os.path.join(base_dir, "..", "..", "architecture", "vars.yml"))
        
        try:
            with open(vars_path, 'r') as f:
                vars_data = yaml.safe_load(f) or {}
            
            pve_host = vars_data.get('proxmox_api_host')
            pve_user = vars_data.get('proxmox_api_user')
            pve_password = vars_data.get('proxmox_api_password')
            pve_node = vars_data.get('proxmox_node', 'pve')
            
            if not pve_host or not pve_user or not pve_password:
                return {"success": False, "error": "Credenziali Proxmox mancanti in vars.yml", "storages": []}

            # 1. Richiesta del Ticket di Autenticazione
            auth_url = f"https://{pve_host}:8006/api2/json/access/ticket"
            auth_res = requests.post(auth_url, data={'username': pve_user, 'password': pve_password}, verify=False, timeout=5)
            auth_res.raise_for_status()
            auth_data = auth_res.json()['data']
            
            headers = {'CSRFPreventionToken': auth_data['CSRFPreventionToken']}
            cookies = {'PVEAuthCookie': auth_data['ticket']}
            
            # 2. Interrogazione degli storage del nodo
            storage_url = f"https://{pve_host}:8006/api2/json/nodes/{pve_node}/storage"
            storage_res = requests.get(storage_url, headers=headers, cookies=cookies, verify=False, timeout=5)
            storage_res.raise_for_status()
            raw_storages = storage_res.json()['data']
            
            formatted_storages = []
            for s in raw_storages:
                # Mostriamo solo gli storage attivi ed escludiamo i bkp/chiavette se non utili
                if s.get('active') == 1:
                    total_bytes = s.get('size', 0)
                    free_bytes = s.get('avail', 0)
                    
                    # Conversione matematica da Byte a Gigabyte (1024^3)
                    total_gb = round(total_bytes / (1024 ** 3), 1)
                    free_gb = round(free_bytes / (1024 ** 3), 1)
                    
                    formatted_storages.append({
                        "name": s['storage'],
                        "type": s['type'],
                        "total_gb": total_gb,
                        "free_gb": free_gb
                    })
            
            return {"success": True, "storages": formatted_storages}
            
        except Exception as e:
            return {"success": False, "error": f"Errore Proxmox API: {str(e)}", "storages": []}