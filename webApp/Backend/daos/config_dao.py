import os

class ConfigDAO:
    def __init__(self, base_dir):
        self.script_dir = os.path.abspath(os.path.join(base_dir, '..', '..', 'architecture', 'tailscale', 'script'))
        print(f"Script directory set to: {self.script_dir}")
        self.vars_path = os.path.abspath(os.path.join(self.script_dir, '../..', 'vars.yml'))
        print(f"Vars path set to: {self.vars_path}")
        self.secrets_path = os.path.abspath(os.path.join(self.script_dir, '../..', 'secrets.yml'))
        print(f"Secrets path set to: {self.secrets_path}")

    def save_config(self, vars_content, secrets_content):
        try:
            with open(self.vars_path, 'w') as f:
                f.write(vars_content)
            with open(self.secrets_path, 'w') as f:
                f.write(secrets_content)
        except Exception as e:
            raise Exception(f"Errore scrittura file YAML: {str(e)}")