import os

class InventoryService:
    @staticmethod
    def generate_inventory(pve_ip):
        base_dir = os.path.dirname(os.path.abspath(__file__))
        architecture_dir = os.path.abspath(os.path.join(base_dir, "..", "..", "..", "architecture"))
        vars_path = os.path.join(architecture_dir, "vars.yml")
        inventory_path = os.path.join(architecture_dir, "inventory.ini")

        ips = {
            'lxc_ip': None,
            'nfs_lxc_ip': None,
            'k3s_server_ip': None,
            'k3s_agent_ip': None,
            'k3s_user': 'kubeuser' # Valore di default
        }
        
        try:
            if os.path.exists(vars_path):
                with open(vars_path, 'r') as f:
                    for line in f:
                        for key in ips.keys():
                            if line.startswith(f"{key}:"):
                                val = line.split(':', 1)[1].strip().strip('"').strip("'").split('/')[0]
                                ips[key] = val
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
            inventory_content.append(f"nfs_server ansible_host={ips['nfs_lxc_ip']} ansible_user=root ansible_ssh_common_args='-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=10'\n")

        # 4. K3s Server (Control Plane)
        if ips.get('k3s_server_ip'):
            inventory_content.append("[k3s_server]")
            inventory_content.append(f"k3s_master ansible_host={ips['k3s_server_ip']} ansible_user={ips['k3s_user']} ansible_ssh_common_args='-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=10'\n")

        # 5. K3s Agent (Worker Node)
        if ips.get('k3s_agent_ip'):
            inventory_content.append("[k3s_agent]")
            inventory_content.append(f"k3s_worker ansible_host={ips['k3s_agent_ip']} ansible_user={ips['k3s_user']} ansible_ssh_common_args='-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=10'\n")

        try:
            with open(inventory_path, 'w') as f:
                f.write("\n".join(inventory_content))
            return inventory_path
        except Exception as e:
            print(f"Errore scrittura inventory.ini: {e}")
            return None