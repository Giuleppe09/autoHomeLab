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
        """Calcola lo spazio fisico reale e lo spazio sicuro allocabile."""
        from services.proxmox_service import ProxmoxService
        
        dao = K3sDAO()
        vars_data, _ = dao.get_k3s_config()
        
        pool_name = vars_data.get('host_mount_path', 'local-lvm')
        
        proxmox_service = ProxmoxService()
        storage_info = proxmox_service.get_detailed_storages()
        
        physical_free = 0.0
        if storage_info.get('success'):
            for storage in storage_info.get('disk_storages', []):
                if storage['name'] == pool_name:
                    physical_free = storage.get('free_gb', 0.0)
                    break
                    
        allocated_gb = 0
        volumes = vars_data.get('nextcloud_storage_volumes', [])
        if isinstance(volumes, str):
            volumes = [volumes]
            
        for vol in volumes:
            if isinstance(vol, str) and vol.endswith('Gi'):
                try:
                    allocated_gb += int(vol.replace('Gi', '').strip())
                except ValueError:
                    pass
                    
        safe_free = round(physical_free - allocated_gb, 1)
        if safe_free < 0:
            safe_free = 0.0
            
        return {
            "pool_name": pool_name,
            "physical_free": physical_free,
            "allocated_gb": allocated_gb,
            "safe_free": safe_free
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