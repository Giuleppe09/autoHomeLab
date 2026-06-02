import os

class InventoryService:
    @staticmethod
    def generate_inventory(pve_ip):
        """
        Genera un inventory.ini globale leggendo gli IP dal file vars.yml
        Centralizza la configurazione per tutti gli script Ansible (Tailscale, NFS, K3s, ecc.)
        """
        base_dir = os.path.dirname(os.path.abspath(__file__))
        # Risaliamo da services -> Backend -> webApp -> HomeLab per poi scendere in architecture
        architecture_dir = os.path.abspath(os.path.join(base_dir, "..", "..", "..", "architecture"))
        vars_path = os.path.join(architecture_dir, "vars.yml")
        inventory_path = os.path.join(architecture_dir, "inventory.ini")

        # Dizionario per mappare le chiavi del vars.yml ai rispettivi IP
        ips = {
            'lxc_ip': None,
            'nfs_lxc_ip': None,
            'k3s_server_ip': None,
            'k3s_agent_ip': None
        }
        print(f"Generazione inventory.ini usando vars.yml da: {vars_path}")
        
        try:
            if os.path.exists(vars_path):
                with open(vars_path, 'r') as f:
                    for line in f:
                        for key in ips.keys():
                            if line.startswith(f"{key}:"):
                                # Estraggo l'IP rimuovendo apici e l'eventuale notazione CIDR (/24)
                                ip_val = line.split(':', 1)[1].strip().strip('"').strip("'").split('/')[0]
                                ips[key] = ip_val
        except Exception as e:
            print(f"Errore durante la lettura di vars.yml: {e}")
            return None

        inventory_content = []

        # 1. Proxmox Node
        if pve_ip:
            inventory_content.append("[proxmox]")
            inventory_content.append(f"proxmox ansible_host={pve_ip} ansible_user=root ansible_ssh_common_args='-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=10'\n")

        # 2. Tailscale LXC
        if ips.get('lxc_ip'):
            inventory_content.append("[tailscale_lxc]")
            inventory_content.append(f"tailscale_lxc ansible_host={ips['lxc_ip']} ansible_user=root ansible_ssh_common_args='-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=10'\n")

        # 3. NFS LXC
        if ips.get('nfs_lxc_ip'):
            inventory_content.append("[nfs_lxc]")
            inventory_content.append(f"nfs_lxc ansible_host={ips['nfs_lxc_ip']} ansible_user=root ansible_ssh_common_args='-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=10'\n")

        # 4. K3s Nodes (Server & Agent)
        if ips.get('k3s_server_ip') or ips.get('k3s_agent_ip'):
            inventory_content.append("[k3s_nodes]")
            if ips.get('k3s_server_ip'):
                inventory_content.append(f"k3s_server ansible_host={ips['k3s_server_ip']} ansible_user=root ansible_ssh_common_args='-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=10'")
            if ips.get('k3s_agent_ip'):
                inventory_content.append(f"k3s_agent ansible_host={ips['k3s_agent_ip']} ansible_user=root ansible_ssh_common_args='-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=10'")
            inventory_content.append("")

        try:
            with open(inventory_path, 'w') as f:
                f.write("\n".join(inventory_content))
            return inventory_path
        except Exception as e:
            print(f"Errore durante la scrittura di inventory.ini: {e}")
            return None