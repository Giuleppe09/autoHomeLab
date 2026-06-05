import os
from flask import jsonify, Response, request, send_from_directory
from services.k3s_service import K3sService

class K3sController:
    
    @staticmethod
    def render_page():
        """Serve la pagina HTML statica per la configurazione di K3s."""
        base_dir = os.path.dirname(os.path.abspath(__file__))
        html_dir = os.path.abspath(os.path.join(base_dir, "..", "..", "Front-End", "html"))
        return send_from_directory(html_dir, 'k3s.html')

    @staticmethod
    def save_config():
        try:
            data = request.get_json()
            if not data:
                return jsonify({"success": False, "message": "Dati non forniti o formato JSON non valido"}), 400
            
            # Validazione: Rimossa la nextcloud_password
            required_fields = ['gateway', 'k3s_server_ip', 'k3s_agent_ip', 'k3s_user', 'k3s_password', 'k3s_template_storage', 'k3s_disk_storage']
            missing = [field for field in required_fields if not data.get(field)]
            
            if missing:
                return jsonify({"success": False, "message": f"Campi obbligatori mancanti: {', '.join(missing)}"}), 400

            K3sService.save_k3s_parameters(data)
            return jsonify({"success": True, "message": "Configurazione K3s salvata con successo"}), 200
            
        except Exception as e:
            return jsonify({"success": False, "message": f"Errore interno del server: {str(e)}"}), 500
    
    @staticmethod
    def run_setup():
        try:
            # Aggiunto silent=True! Se il front-end non manda nulla, usa un dizionario vuoto.
            data = request.get_json(silent=True) or {}
            pve_ip = data.get('pve_ip', None)
            
            return Response(
                K3sService.execute_k3s_setup_stream(pve_ip), 
                mimetype='application/json',
                headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"}
            )
        except Exception as e:
            return jsonify({"success": False, "message": f"Impossibile avviare il setup: {str(e)}"}), 500