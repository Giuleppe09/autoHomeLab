import os

class TailscaleDAO:
    def __init__(self):
        self.base_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../architecture/tailscale"))
        self.vars_path = os.path.join(self.base_path, "vars.yml")
        self.secrets_path = os.path.join(self.base_path, "secrets.yml")

    def save_config(self, data):
        vars_content = f"""---
proxmox_api_host: "{data['pve_ip']}"
proxmox_api_user: "ansible@pve"
proxmox_api_token_id: "provisioner"
lxc_vmid: 101
lxc_hostname: "tailscale-gateway"
lxc_ip: "{data['lxc_ip']}"
lxc_gw: "{data['lxc_gw']}"
template_storage: "{data.get('template_storage', 'local')}"
disk_storage: "{data.get('disk_storage', 'local-lvm')}"
"""
        secrets_content = f"""---
tailscale_auth_key: "{data['ts_auth']}"
tailscale_api_key: "{data['ts_api']}"
"""
        with open(self.vars_path, "w") as f:
            f.write(vars_content)
        with open(self.secrets_path, "w") as f:
            f.write(secrets_content)
        return True