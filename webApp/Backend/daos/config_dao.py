import os
import yaml

class ConfigDAO:
    def __init__(self, base_dir):
        # base_dir corrisponde a webApp/Backend/
        self.vars_path = os.path.abspath(os.path.join(base_dir, '..', '..', 'architecture', 'vars.yml'))
        self.secrets_path = os.path.abspath(os.path.join(base_dir, '..', '..', 'architecture', 'secrets.yml'))

    def get_proxmox_ip(self):
        """Legge l'IP sorgente di Proxmox salvato nel file vars.yml"""
        if os.path.exists(self.vars_path):
            with open(self.vars_path, 'r') as f:
                data = yaml.safe_load(f) or {}
                return data.get('proxmox_api_host')
        return None

    def update_vars(self, updates: dict):
        """Esegue un aggiornamento incrementale su vars.yml salvaguardando le altre chiavi"""
        vars_data = {}
        if os.path.exists(self.vars_path):
            with open(self.vars_path, 'r') as f:
                vars_data = yaml.safe_load(f) or {}
        
        vars_data.update(updates)
        
        with open(self.vars_path, 'w') as f:
            yaml.safe_dump(vars_data, f, default_flow_style=False, sort_keys=False)

    def update_secrets(self, updates: dict):
        """Esegue un aggiornamento incrementale su secrets.yml salvaguardando le altre chiavi"""
        secrets_data = {}
        if os.path.exists(self.secrets_path):
            with open(self.secrets_path, 'r') as f:
                secrets_data = yaml.safe_load(f) or {}
        
        secrets_data.update(updates)
        
        with open(self.secrets_path, 'w') as f:
            yaml.safe_dump(secrets_data, f, default_flow_style=False, sort_keys=False)