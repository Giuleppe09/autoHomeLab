from flask import jsonify, Response, stream_with_context, session
from services.nfs_service import NfsService

class NfsController:
    @staticmethod
    def save_nfs_config(request):
        try:
            NfsService.save_nfs_parameters(request.json)
            return jsonify({"status": "success", "message": "Configurazione NFS salvata con successo!"}), 200
        except Exception as e:
            return jsonify({"status": "error", "message": str(e)}), 500

    @staticmethod
    def run_nfs_setup():
        pve_ip = session.get('pve_ip')
        def generate():
            for line in NfsService.execute_nfs_setup_stream(pve_ip):
                yield line
        return Response(stream_with_context(generate()), mimetype='text/plain')