import os
import subprocess
import json
import platform

class ProxmoxService:
    @staticmethod
    def check_status(pve_ip):
        if not pve_ip:
            return False
            
        ping_cmd = ['ping', '-c', '1', '-W', '1', pve_ip]
        if platform.system() == "Windows":
            ping_cmd = ['ping', '-n', '1', '-w', '1000', pve_ip]
            
        result = subprocess.run(ping_cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        return result.returncode == 0

    @staticmethod
    def discover_storages_stream(pve_ip, base_dir):
        if pve_ip == "test":
            yield "🚀 Simulazione connessione a Proxmox (Modalità Test)...\n"
            yield "✅ Host raggiungibile.\n"
            yield "✅ Storage individuati.\n"
            script_dir = os.path.abspath(os.path.join(base_dir, '..', '..', 'architecture', 'tailscale', 'script'))
            json_path = os.path.abspath(os.path.join(script_dir, '..', 'proxmox_info.json'))
            with open(json_path, 'w') as f:
                json.dump({"template_storages": ["local (TEST)"], "disk_storages": ["local-lvm (TEST)"]}, f)
            return
            
        script_dir = os.path.abspath(os.path.join(base_dir, '..', '..', 'architecture', 'tailscale', 'script'))
        playbook_path = os.path.join(script_dir, '00_get_proxmox_info.yml') #
        
        ansible_cmd = [
            'ansible-playbook', '-i', 'proxmox,', playbook_path,
            '-e', f"ansible_host={pve_ip}", '-e', "ansible_user=root"
        ]
        
        process = subprocess.Popen(ansible_cmd, cwd=script_dir, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1)
        for line in iter(process.stdout.readline, ''):
            yield line
            
        process.stdout.close()
        process.wait()
        
        if process.returncode != 0:
            raise Exception("Non è stato possibile ottenere informazioni dal Server Proxmox.")

    @staticmethod
    def read_storages(base_dir):
        script_dir = os.path.abspath(os.path.join(base_dir, '..', '..', 'architecture', 'tailscale', 'script'))
        json_path = os.path.abspath(os.path.join(script_dir, '..', 'proxmox_info.json'))
        try:
            with open(json_path, 'r') as f: return json.load(f)
        except Exception as e:
            raise Exception(f"Errore lettura JSON di discovery: {str(e)}")