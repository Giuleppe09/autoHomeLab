from flask import Response, stream_with_context, jsonify
from services.nfs_service import NfsService

class NfsController:
    
    @staticmethod
    def save_nfs_config(request):
        print("Ricevuta richiesta POST per il salvataggio della configurazione NFS")
        
        # Recuperiamo il JSON inviato dal frontend
        data = request.get_json(silent=True)
        if not data:
            return jsonify({"success": False, "error": "Nessun dato JSON ricevuto"}), 400
            
        # Deleghiamo al Service la scrittura effettiva nel file vars.yml
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