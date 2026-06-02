import os
from flask import Response, stream_with_context, jsonify, render_template
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
    
    @staticmethod
    def render_nfs_page():
        # Calcoliamo i percorsi necessari
        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        template_dir = os.path.abspath(os.path.join(base_dir, '..', 'Front-End', 'html'))

        if not os.path.exists(os.path.join(template_dir, 'config_nfs.html')):
            return f"ERRORE: config_nfs.html non trovato in {template_dir}"

        # 1. Chiamiamo il Service per ottenere i dati (nessuna logica qui nel Controller)
        nfs_service = NfsService()
        storages = nfs_service.get_available_storages(base_dir)

        # 2. Renderizziamo la vista passando i dati estratti
        return render_template(
            'config_nfs.html', 
            template_storages=storages['template_storages'], 
            disk_storages=storages['disk_storages']
        )