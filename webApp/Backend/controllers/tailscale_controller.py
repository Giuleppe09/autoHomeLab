import os
from flask import jsonify, Response, stream_with_context, render_template
from services.tailscale_service import TailscaleService
from daos.config_dao import ConfigDAO

base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

class TailscaleController:
    @staticmethod
    def render_page():
        template_dir = os.path.abspath(os.path.join(base_dir, '..', 'Front-End', 'html'))
        if not os.path.exists(os.path.join(template_dir, 'tailscale.html')):
            return f"ERRORE: tailscale.html non trovato"
        return render_template('tailscale.html')

    @staticmethod
    def save_config(request):
        data = request.get_json(silent=True)
        service = TailscaleService()
        success = service.save_parameters(data)
        return jsonify({"result": "success" if success else "error"})

    # Il controller non deve chiamare dirattamente dao.
    @staticmethod
    def run_setup():
        # Leggiamo l'IP in modo stateless dal DAO!
        dao = ConfigDAO(base_dir)
        pve_ip = dao.get_proxmox_ip()
        service = TailscaleService()

        def generate():
            for line in service.execute_setup_stream(pve_ip):
                yield line
                
        return Response(stream_with_context(generate()), mimetype='text/plain')