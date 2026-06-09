import os
import subprocess
import json
from daos.k3s_dao import K3sDAO

class ServicesLayerService:
    
    @staticmethod
    def save_nextcloud_config(data):
        """Riceve il dizionario pulito dal Controller e lo salva in vars.yml tramite DAO"""
        dao = K3sDAO()
        existing_vars, _ = dao.get_k3s_config()
        
        # Aggiorna il dizionario esistente con i nuovi parametri di Nextcloud
        existing_vars.update(data)
        
        # Persiste le modifiche sul file fisico
        dao.save_k3s_config(existing_vars, {})
        return True


    @staticmethod
    def get_storage_accounting():
        """
        Calcola l'accounting globale leggendo lo spazio fisico dall'NFS 
        e sommando dinamicamente tutti i volumi allocati nel vars.yml.
        """
        dao = K3sDAO()
        vars_data, _ = dao.get_k3s_config()
        
        nfs_ip = vars_data.get('lxc_ip', '192.168.1.X') 
        nfs_path = vars_data.get('lxc_mount_path', '/mnt/shared') 
        nfs_user = 'root'
        
        physical_free = 0.0
        
        # ==========================================
        # 🔧 MODALITÀ TEST OFFLINE (MOCK MODE)
        # Imposta a False quando avrai il server reale
        MOCK_MODE = True
        # ==========================================
        
        try:
            if MOCK_MODE:
                print("🔧 [DEBUG] MOCK_MODE ATTIVO: Simulo la risposta SSH dell'NFS...")
                simulated_stdout = "/dev/loop0  1000G  200G  800G  20% /mnt/shared\n"
                parts = simulated_stdout.strip().split()
            else:
                ssh_cmd = [
                    "ssh", 
                    "-o", "StrictHostKeyChecking=no",
                    "-o", "ConnectTimeout=5",
                    f"{nfs_user}@{nfs_ip}", 
                    f"df -BG {nfs_path} | tail -n 1"
                ]
                result = subprocess.run(ssh_cmd, capture_output=True, text=True, check=True)
                parts = result.stdout.strip().split()
                
            if len(parts) >= 4:
                physical_free = float(parts[3].replace('G', ''))
                
        except Exception as e:
            print(f"⚠️ Errore di connessione SSH all'LXC NFS ({nfs_ip}): {e}")
            physical_free = 0.0 
                    
        # 3. COMPUTAZIONE GLOBALE E BREAKDOWN DEI PVC
        global_allocated_gb = 0
        services_breakdown = {} # <-- NUOVO: Dizionario per tracciare i singoli servizi
        
        for key, value in vars_data.items():
            if key.endswith('_storage_volumes'):
                # Ricaviamo il nome pulito del servizio (es: "nextcloud")
                srv_name = key.replace('_storage_volumes', '')
                service_total = 0
                
                volumes = value if isinstance(value, list) else [value]
                for vol in volumes:
                    if isinstance(vol, str) and vol.endswith('Gi'):
                        try:
                            service_total += int(vol.replace('Gi', '').strip())
                        except ValueError:
                            pass
                
                # Salviamo il parziale e aggiorniamo il totale globale
                services_breakdown[srv_name] = service_total
                global_allocated_gb += service_total
                            
        # 4. CALCOLO OVERPROVISIONING
        safe_free = round(physical_free - global_allocated_gb, 1)
        if safe_free < 0:
            safe_free = 0.0
            
        return {
            "physical_free": physical_free,
            "global_allocated_gb": global_allocated_gb,
            "safe_free": safe_free,
            "services_breakdown": services_breakdown # <-- NUOVO: Restituiamo il dettaglio
        }

    @staticmethod
    def add_nextcloud_storage_volume(new_size):
        """Recupera la configurazione, verifica l'overprovisioning e aggiunge il volume."""
        dao = K3sDAO()
        existing_vars, _ = dao.get_k3s_config()
        
        new_size_val = int(str(new_size).replace('Gi', '').strip())
        
        accounting = ServicesLayerService.get_storage_accounting()
        safe_free = accounting.get('safe_free', 0.0)
        pool_name = accounting.get('pool_name', 'Sconosciuto')
        
        if new_size_val > safe_free:
            raise ValueError(f"Overprovisioning evitato: richiesti +{new_size_val}GB, ma lo spazio SICURO assegnabile su '{pool_name}' è di soli {safe_free}GB.")
        
        volumes = existing_vars.get('nextcloud_storage_volumes', [])
        if isinstance(volumes, str):
            volumes = [volumes]
            
        new_size_str = f"{new_size_val}Gi"
        volumes.append(new_size_str)
        existing_vars['nextcloud_storage_volumes'] = volumes
        
        dao.save_k3s_config(existing_vars, {})
        return True

    @staticmethod
    def execute_nextcloud_stream(inventory_path):
        """Esegue in streaming il playbook di Nextcloud e calcola l'URL finale"""
        dao = K3sDAO()
        playbook_path = os.path.join(dao.arch_dir, "services", "deploy_nextcloud.yml")
        
        if not inventory_path:
            yield json.dumps({"success": False, "log": "\n❌ Errore: inventory path mancante.\n"}) + "\n"
            return

        vars_data, _ = dao.get_k3s_config()
        agent_ip_raw = vars_data.get('k3s_agent_ip', '127.0.0.1/24')
        agent_ip = agent_ip_raw.split('/')[0]
        nextcloud_url = f"http://{agent_ip}:30080"

        env = os.environ.copy()
        env["ANSIBLE_HOST_KEY_CHECKING"] = "False"
        env["PYTHONUNBUFFERED"] = "1"

        yield json.dumps({"log": "\n▶️ Esecuzione del Playbook Ansible per Nextcloud...\n" + "-"*50 + "\n"}) + "\n"
        
        cmd = ["ansible-playbook", "-i", inventory_path, playbook_path]
        process = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1, env=env)
        
        for line in iter(process.stdout.readline, ''):
            yield json.dumps({"log": line}) + "\n"
            
        process.stdout.close()
        process.wait()
        
        if process.returncode == 0:
            yield json.dumps({
                "success": True, 
                "url": nextcloud_url, 
                "log": f"\n✅ Nextcloud distribuito con successo nel cluster!\n🚀 Servizio raggiungibile su: {nextcloud_url}\n"
            }) + "\n"
        else:
            yield json.dumps({"success": False, "log": f"\n❌ Errore nel Deployment applicativo. Codice errore: {process.returncode}\n"}) + "\n"