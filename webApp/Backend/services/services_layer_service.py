import os
import subprocess
import json
from daos.k3s_dao import K3sDAO

class ServicesLayerService:
    
    @staticmethod
    def save_nextcloud_config(data):
        """Smista i dati iniziali convertendo la quota in una lista di volumi"""
        dao = K3sDAO()
        vars_data = {}
        secrets_data = {}
        
        for key, value in data.items():
            if "password" in key.lower() or "secret" in key.lower():
                secrets_data[key] = value
            else:
                vars_data[key] = value
        
        # Intercettiamo la dimensione iniziale e la formattiamo come primo elemento di una lista
        if 'nextcloud_storage_size' in vars_data:
            size_val = str(vars_data.pop('nextcloud_storage_size')).strip()
            if not size_val.endswith('Gi'):
                size_val += 'Gi'
            vars_data['nextcloud_storage_volumes'] = [size_val]

        dao.save_k3s_config(vars_data, secrets_data)

    @staticmethod
    def add_nextcloud_storage_volume(new_size):
        """Recupera la configurazione attuale e aggiunge una nuova voce alla lista"""
        dao = K3sDAO()
        existing_vars, _ = dao.get_k3s_config()
        
        # Estrae la lista esistente o ne crea una nuova se assente
        volumes = existing_vars.get('nextcloud_storage_volumes', [])
        if isinstance(volumes, str):
            volumes = [volumes]
            
        if not new_size.endswith('Gi'):
            new_size += 'Gi'
            
        volumes.append(new_size)
        existing_vars['nextcloud_storage_volumes'] = volumes
        
        # Persiste l'array aggiornato in vars.yml
        dao.save_k3s_config(existing_vars, {})

        
    @staticmethod
    def execute_nextcloud_stream(inventory_path):
        """Esegue in streaming il playbook di Nextcloud e calcola l'URL finale"""
        dao = K3sDAO()
        playbook_path = os.path.join(dao.arch_dir, "services", "deploy_nextcloud.yml")
        
        if not inventory_path:
            yield json.dumps({"success": False, "log": "\n❌ Errore: inventory path mancante.\n"}) + "\n"
            return

        # Recuperiamo l'IP dell'agent per calcolare l'URL di Nextcloud
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
            # Inviamo l'URL all'interno della risposta di successo
            yield json.dumps({
                "success": True, 
                "url": nextcloud_url, 
                "log": f"\n✅ Nextcloud distribuito con successo nel cluster!\n🚀 Servizio raggiungibile su: {nextcloud_url}\n"
            }) + "\n"
        else:
            yield json.dumps({"success": False, "log": f"\n❌ Errore nel Deployment applicativo. Codice errore: {process.returncode}\n"}) + "\n"