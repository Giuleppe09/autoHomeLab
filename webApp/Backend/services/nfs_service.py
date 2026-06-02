import subprocess
import os
import json
import yaml
from services.inventory_service import InventoryService
from services.proxmox_service import ProxmoxService

class NfsService:
    def __init__(self):
        # Risaliamo dal file per puntare alla cartella architecture
        base_dir = os.path.dirname(os.path.abspath(__file__))
        architecture_path = os.path.abspath(os.path.join(base_dir, "..", "..", "..", "architecture"))
        
        self.scripts_path = os.path.join(architecture_path, "nfs")
        self.vars_path = os.path.join(architecture_path, "vars.yml")

    def get_available_storages(self, base_dir):
        """Recupera gli storage disponibili leggendo il file JSON fisico senza usare la sessione."""
        try:
            info = ProxmoxService.read_storages(base_dir)
            return {
                'template_storages': info.get('template_storages', ['local']),
                'disk_storages': info.get('disk_storages', ['local', 'local-lvm'])
            }
        except Exception as e:
            print(f"Errore durante il recupero degli storage per NFS: {e}")
            # Valori di fallback in caso il file non sia ancora stato generato
            return {
                'template_storages': ['local'],
                'disk_storages': ['local', 'local-lvm']
            }
        
    def _get_proxmox_ip(self):
        """Metodo privato per recuperare l'IP da vars.yml"""
        try:
            with open(self.vars_path, 'r') as file:
                vars_data = yaml.safe_load(file)
                return vars_data.get('proxmox_api_host')
        except Exception as e:
            print(f"Errore durante la lettura di {self.vars_path}: {e}")
            return None

    def execute_setup_stream(self):
        # 1. Recupero dell'IP gestito interamente dal Service
        pve_ip = self._get_proxmox_ip()
        if not pve_ip:
            yield json.dumps({"success": False, "log": f"\n❌ Errore: Impossibile recuperare 'proxmox_api_host' da {self.vars_path}.\n"}) + "\n"
            return
            
        print(f"Generazione inventory.ini centralizzato per NFS usando l'IP Proxmox: {pve_ip}")
        
        # 2. Generazione dell'inventory
        inventory_path = InventoryService.generate_inventory(pve_ip)
        if not inventory_path:
            yield json.dumps({"success": False, "log": "\n❌ Errore durante la generazione dell'inventory Ansible centralizzato.\n"}) + "\n"
            return

        # 3. I playbook per la configurazione del NAS/NFS
        playbooks = ["1_create_nfs_lxc.yml", "2_configure_nfs.yml"]
        
        env = os.environ.copy()
        env["ANSIBLE_HOST_KEY_CHECKING"] = "False"
        env["PYTHONUNBUFFERED"] = "1"
        
        for pb in playbooks:
            pb_path = os.path.join(self.scripts_path, pb)
            yield json.dumps({"log": f"\n\n▶️ Esecuzione di: {pb}...\n{'-'*40}\n"}) + "\n"
            
            # --- MODIFICA CHIAVE: Aggiunto -e per forzare il caricamento del file vars.yml ---
            cmd = [
                "ansible-playbook", 
                "-i", inventory_path, 
                "-e", f"@{self.vars_path}", 
                pb_path
            ]
            
            process = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1, env=env)
            
            for line in iter(process.stdout.readline, ''):
                yield json.dumps({"log": line}) + "\n"
                
            process.stdout.close()
            process.wait()
            
            if process.returncode != 0:
                yield json.dumps({"success": False, "log": f"\n❌ Errore durante l'esecuzione di {pb} (Codice: {process.returncode}). Setup interrotto.\n"}) + "\n"
                break
        else:
            yield json.dumps({"success": True, "log": "\n✅ Tutti i playbook NFS sono stati eseguiti con successo!\n"}) + "\n"

    def save_config(self, data):
        """Salva i dati provenienti dal frontend dentro vars.yml"""
        try:
            # 1. Leggiamo il file vars.yml esistente per non sovrascrivere le altre variabili
            vars_data = {}
            if os.path.exists(self.vars_path):
                with open(self.vars_path, 'r') as file:
                    vars_data = yaml.safe_load(file) or {}
            
            # 2. Aggiorniamo il dizionario con i nuovi dati NFS provenienti dal form
            for key, value in data.items():
                vars_data[key] = value
                
            # 3. 🔹 FORZATURA IN BACKEND: Iniettiamo i parametri strutturali NFS
            vars_data['nfs_hostname'] = "nfs-server"
            vars_data['nfs_vmid'] = None  # In YAML verrà scritto come: null
                
            # 4. Scriviamo tutto di nuovo nel file vars.yml
            with open(self.vars_path, 'w') as file:
                yaml.safe_dump(vars_data, file, default_flow_style=False, sort_keys=False)
                
            print(f"Configurazione NFS salvata con successo in {self.vars_path} (Hostname e VMID gestiti dal backend)")
            return True, "Configurazione salvata correttamente."
            
        except Exception as e:
            error_msg = f"Errore durante la scrittura di vars.yml: {str(e)}"
            print(error_msg)
            return False, error_msg