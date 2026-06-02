import os
import yaml

class NfsDAO:
    def __init__(self):
        # Calcola il percorso base della cartella 'architecture'
        base_dir = os.path.dirname(os.path.abspath(__file__))
        self.arch_dir = os.path.abspath(os.path.join(base_dir, '..', '..', '..', 'architecture'))
        self.k3s_dir = os.path.join(self.arch_dir, 'k3s')
        os.makedirs(self.k3s_dir, exist_ok=True)

    def get_nfs_config(self):
        """Recupera le configurazioni dal file globale dell'architettura"""
        vars_path = os.path.join(self.arch_dir, 'vars.yml')
        secrets_path = os.path.join(self.arch_dir, 'secrets.yml')
        nfs_vars, nfs_secrets = {}, {}
        
        if os.path.exists(vars_path):
            with open(vars_path, 'r') as f:
                nfs_vars = yaml.safe_load(f) or {}
                
        if os.path.exists(secrets_path):
            with open(secrets_path, 'r') as f:
                nfs_secrets = yaml.safe_load(f) or {}
                
        return nfs_vars, nfs_secrets

    def save_nfs_config(self, vars_data, secrets_data):
        """Salva i dizionari nei rispettivi file YAML (mergiando con i dati esistenti)"""
        existing_vars, existing_secrets = self.get_nfs_config()
        existing_vars.update(vars_data)
        existing_secrets.update(secrets_data)
        
        with open(os.path.join(self.arch_dir, 'vars.yml'), 'w') as f:
            yaml.dump(existing_vars, f, default_flow_style=False, sort_keys=False)
        with open(os.path.join(self.arch_dir, 'secrets.yml'), 'w') as f:
            yaml.dump(existing_secrets, f, default_flow_style=False, sort_keys=False)