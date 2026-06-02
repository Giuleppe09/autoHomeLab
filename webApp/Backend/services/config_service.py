from services.network_service import NetworkService
from daos.config_dao import ConfigDAO

class ConfigService:
    def __init__(self, base_dir):
        self.network_service = NetworkService()
        self.config_dao = ConfigDAO(base_dir)

    def process_and_save(self, data, pve_ip):
        if not pve_ip:
            raise ValueError("Sessione scaduta o IP Proxmox mancante. Ricarica la pagina iniziale.")

        lxc_ip_full = data.get('lxc_ip', '')
        if not self.network_service.is_ip_valid_cidr(lxc_ip_full):
            raise ValueError("Formato IP non valido. È obbligatorio includere la Netmask (es. 192.168.1.200/24).")

        ip_only = lxc_ip_full.split('/')[0]
        if self.network_service.is_ip_in_use(ip_only):
            raise ValueError(f"Attenzione: l'IP {ip_only} è già in uso nella rete! Scegli un IP libero.")

        vars_content = f"""---
proxmox_api_host: "{pve_ip}"
proxmox_api_user: "ansible@pve"
proxmox_api_token_id: "provisioner"
lxc_vmid: 101
lxc_hostname: "tailscale-gateway"
lxc_ip: "{data.get('lxc_ip')}"
lxc_gw: "{data.get('lxc_gw')}"
lxc_template_storage: "{data.get('lxc_template_storage')}"
lxc_disk_storage: "{data.get('lxc_disk_storage')}"
"""
        secrets_content = f"""---
tailscale_auth_key: "{data.get('ts_auth')}"
tailscale_api_key: "{data.get('ts_api')}"
ansible_become_pass: "{data.get('ansible_become_pass')}"
"""

        self.config_dao.save_config(vars_content, secrets_content)