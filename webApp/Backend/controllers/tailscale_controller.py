import os
from flask import jsonify, Response, stream_with_context, render_template
from services.config_service import ConfigService
from services.inventory_service import InventoryService
from services.tailscale_service import TailscaleService

base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

class TailscaleController:
    @staticmethod
    def render_page():
        template_dir = os.path.abspath(os.path.join(base_dir, '..', 'Front-End', 'html'))
        return render_template('tailscale.html')

    @staticmethod
    def save_config(request):
        data = request.get_json(silent=True)
        service = TailscaleService()
        success = service.save_parameters(data)
        return jsonify({"result": "success" if success else "error"})

    @staticmethod
    def run_setup():
        # 1. Il Controller orchestra: chiede l'IP al ConfigService
        config_service = ConfigService(base_dir)
        pve_ip = config_service.get_proxmox_ip()

        # 2. Chiede la generazione dell'inventory
        inventory_path = InventoryService.generate_inventory(pve_ip)
        
        # 3. Passa il path pronto al Service specifico
        service = TailscaleService()

        def generate():
            for line in service.execute_setup_stream(inventory_path):
                yield line
                
        return Response(stream_with_context(generate()), mimetype='text/plain')