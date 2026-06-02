from flask import jsonify, request, Response, stream_with_context, session
from services.tailscale_service import TailscaleService

class TailscaleController:
    def __init__(self):
        self.service = TailscaleService()

    def save_config(self):
        data = request.json
        success = self.service.save_parameters(data)
        return jsonify({"result": "success" if success else "error"})

    def run_setup(self):
        pve_ip = session.get('pve_ip')
        def generate():
            for line in self.service.execute_setup_stream(pve_ip):
                yield line
                
        return Response(stream_with_context(generate()), mimetype='text/plain')