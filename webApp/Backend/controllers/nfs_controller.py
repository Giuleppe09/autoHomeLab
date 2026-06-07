import os
from flask import Response, stream_with_context, jsonify, render_template
from services.nfs_service import NfsService
from services.proxmox_service import ProxmoxService

base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

class NfsController:
    
    @staticmethod
    def save_nfs_config(request):
        
        data = request.get_json(silent=True)
        if not data:
            return jsonify({"success": False, "error": "Nessun dato JSON ricevuto"}), 400
            
        nfs_service = NfsService()
        success, message = nfs_service.save_config(data)
        
        if success:
            return jsonify({"success": True, "message": message}), 200
        else:
            return jsonify({"success": False, "error": message}), 500

    @staticmethod
    def handle_setup_request():
        print("Ricevuta richiesta POST per setup NFS - Delega al Service")
        nfs_service = NfsService()
        
        return Response(
            stream_with_context(nfs_service.execute_setup_stream()),
            mimetype='application/json'
        )
    
    @staticmethod
    def render_nfs_page():
        template_dir = os.path.abspath(os.path.join(base_dir, '..', 'Front-End', 'html'))
        if not os.path.exists(os.path.join(template_dir, 'config_nfs.html')):
            return f"ERRORE: config_nfs.html non trovato in {template_dir}"
        return render_template('config_nfs.html')

    @staticmethod
    def get_storages_api():
        """Restituisce l'elenco degli storage interrogando le API di Proxmox"""
        try:
            proxmox_service = ProxmoxService()
            result = proxmox_service.get_detailed_storages()
            
            if not result.get("success"):
                return jsonify({"error": result.get("error")}), 500
                
            print(f"Storages letti per API: {result}")
            return jsonify(result), 200
        except Exception as e:
            return jsonify({"error": f"Impossibile interrogare le info di Proxmox: {str(e)}"}), 500