from flask import jsonify, Response, stream_with_context, session
from services.k3s_service import K3sService

class K3sController:
    @staticmethod
    def save_k3s_config(request):
        try:
            K3sService.save_k3s_parameters(request.json)
            return jsonify({"status": "success", "message": "Configurazione K3s salvata con successo!"}), 200
        except Exception as e:
            return jsonify({"status": "error", "message": str(e)}), 500

    @staticmethod
    def run_k3s_setup():
        pve_ip = session.get('pve_ip')
        def generate():
            for line in K3sService.execute_k3s_setup_stream(pve_ip):
                yield line
                
        return Response(stream_with_context(generate()), mimetype='text/plain')