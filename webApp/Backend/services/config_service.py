import os
from services.network_service import NetworkService
from daos.config_dao import ConfigDAO

class ConfigService:
    def __init__(self, base_dir):
        self.network_service = NetworkService()
        self.config_dao = ConfigDAO(base_dir)

    def save_proxmox_ip(self, pve_ip):
        """Salva l'IP di Proxmox ereditato dalla schedulazione iniziale"""
        if not pve_ip:
            raise ValueError("L'indirizzo IP Proxmox non può essere vuoto.")
        self.config_dao.update_vars({'proxmox_api_host': pve_ip})

    def get_proxmox_ip(self):
        """Recupera l'IP del server Proxmox salvato negli YAML"""
        return self.config_dao.get_proxmox_ip()

    def process_and_save(self, data):
        """Esegue le validazioni di rete live e archivia i parametri di configurazione base"""
        pve_ip = self.get_proxmox_ip()
        if not pve_ip:
            raise ValueError("IP Proxmox non individuato. Torna alla pagina iniziale.")

        lxc_ip_full = data.get('lxc_ip', '')
        if not self.network_service.is_ip_valid_cidr(lxc_ip_full):
            raise ValueError("Formato IP Gateway LXC non valido. Includi la maschera CIDR (es. 192.168.1.16/24).")

        ip_only = lxc_ip_full.split('/')[0]
        if self.network_service.is_ip_in_use(ip_only):
            raise ValueError(f"L'IP {ip_only} è occupato da un altro dispositivo in rete! Scegline un altro.")

        # Prepariamo il dizionario con le chiavi per vars.yml
        vars_updates = {
            'proxmox_api_host': pve_ip,
            'proxmox_api_user': "ansible@pve",
            'proxmox_api_token_id': "provisioner",
            'lxc_vmid': 101,
            'lxc_hostname': "tailscale-gateway",
            'lxc_ip': data.get('lxc_ip'),
            'lxc_gw': data.get('lxc_gw'),
            'lxc_template_storage': data.get('lxc_template_storage'),
            'lxc_disk_storage': data.get('lxc_disk_storage')
        }

        # Prepariamo le chiavi per secrets.yml (gestendo le mappature del form JS)
        sudo_pass = data.get('local_sudo_pass') or data.get('ansible_become_pass')
        secrets_updates = {
            'tailscale_auth_key': data.get('ts_auth'),
            'tailscale_api_key': data.get('ts_api'),
            'ansible_become_pass': sudo_pass
        }

        # Salvataggio sicuro tramite DAO
        self.config_dao.update_vars(vars_updates)
        self.config_dao.update_secrets(secrets_updates)