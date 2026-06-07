import os
from flask import jsonify, render_template
from services.config_service import ConfigService
from services.network_service import NetworkService
from services.proxmox_service import ProxmoxService

base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

class ConfigController:

    @staticmethod
    def render_config_page():
        """Renderizza la pagina HTML statica"""
        template_dir = os.path.abspath(os.path.join(base_dir, '..', 'Front-End', 'html'))
        if not os.path.exists(os.path.join(template_dir, 'config.html')):
            return f"ERRORE: config.html non trovato in {template_dir}"
        return render_template('config.html')
    
    @staticmethod
    def render_dashboard():
        """Renderizza la dashboard di gestione"""
        template_dir = os.path.abspath(os.path.join(base_dir, '..', 'Front-End', 'html'))
        if not os.path.exists(os.path.join(template_dir, 'dashboard.html')):
            return f"ERRORE: dashboard.html non trovato in {template_dir}"
        return render_template('dashboard.html')

    @staticmethod
    def check_status(request):
        """Verifica lo stato online del nodo leggendo l'IP da vars.yml"""
        service = ConfigService(base_dir)
        pve_ip = service.get_proxmox_ip()
        proxmox_service = ProxmoxService()
        is_online = proxmox_service.check_status(pve_ip)
        return jsonify({"status": "online" if is_online else "offline"}), 200

    @staticmethod
    def init_proxmox_api(request):
        """Riceve l'IP inserito nella index, lo archivia ed esegue l'Ansible sincrono di scoperta storage"""

        data = request.get_json(silent=True)
        if not data:
             return jsonify({"success": False, "error": "JSON non configurato correttamente"}), 400
             
        pve_ip = data.get('pve_ip')
        
        if not pve_ip:
            return jsonify({"success": False, "error": "Indirizzo IP PVE mancante"}), 400

        try:
            service = ConfigService(base_dir)
            # Salva l'IP di destinazione negli YAML
            service.save_proxmox_ip(pve_ip)

            # Lancia i playbook di test connessione e setup autenticazione
            proxmox_service = ProxmoxService()
            proxmox_service.init_connection(pve_ip, base_dir)
            return jsonify({"success": True}), 200

        except Exception as e:
            return jsonify({"success": False, "error": str(e)}), 500

    @staticmethod
    def scan_ips(request):
        """Scansiona gli IP liberi sulla subnet"""
        data = request.get_json(silent=True) or {}
        gw = data.get('gateway')
        if not gw:
            return jsonify({"error": "Il parametro Gateway è obbligatorio"}), 400

        try:
            service = ConfigService(base_dir)
            pve_ip = service.get_proxmox_ip()
            free_ips = NetworkService.scan_for_free_ips(gw, pve_ip)
            return jsonify({"free_ips": free_ips}), 200
        except ValueError as e: 
            return jsonify({"error": str(e)}), 400
        except Exception as e: 
            return jsonify({"error": f"Errore interno durante il controllo arp: {str(e)}"}), 500

    @staticmethod
    def get_storages_api():
        """Restituisce l'elenco degli storage disponibili e il loro spazio interrogando direttamente l'API di Proxmox"""
        try:
            proxmox_service = ProxmoxService()
            result = proxmox_service.get_detailed_storages()
            
            if not result.get("success"):
                return jsonify({"error": result.get("error")}), 500
                
            print("STORAGES TROVATI:", result)
            return jsonify(result), 200
        except Exception as e:
            return jsonify({"error": f"Errore durante l'interrogazione degli storage: {str(e)}"}), 500

    @staticmethod
    def save_config(request):
        """Salva la configurazione finale dello Step 2 validando i dati live sul Service layer"""
        data = request.get_json(silent=True)
        if not data:
            return jsonify({"status": "error", "message": "Nessun payload JSON ricevuto"}), 400

        try:
            service = ConfigService(base_dir)
            service.process_and_save(data)
            return jsonify({"status": "success", "message": "Configurazione completata con successo."}), 200
        except ValueError as e: 
            return jsonify({"status": "error", "message": str(e)}), 400
        except Exception as e: 
            return jsonify({"status": "error", "message": f"Errore scrittura parametri: {str(e)}"}), 500

    @staticmethod
    def get_infrastructure_state():
        """Recupera lo stato attuale dell'infrastruttura (vars.yml) per popolare la Dashboard"""
        try:
            vars_path = os.path.abspath(os.path.join(base_dir, "..", "..", "architecture", "vars.yml"))
            import yaml
            with open(vars_path, 'r') as f:
                state = yaml.safe_load(f) or {}
            return jsonify({"success": True, "state": state}), 200
        except Exception as e:
            return jsonify({"success": False, "error": f"Errore lettura stato: {str(e)}"}), 500