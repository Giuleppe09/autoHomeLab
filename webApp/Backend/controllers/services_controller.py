import os
from flask import jsonify, Response, request, send_from_directory, stream_with_context
from services.services_layer_service import ServicesLayerService
from services.config_service import ConfigService
from services.inventory_service import InventoryService

base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

class ServicesController:
    
    @staticmethod
    def render_page():
        """Serve la risorsa statica HTML per l'interfaccia dei servizi"""
        html_dir = os.path.abspath(os.path.join(base_dir, "..", "Front-End", "html"))
        return send_from_directory(html_dir, 'services.html')

    @staticmethod
    def save_nextcloud_config():
        """Estrae ed archivia i dati dal payload dinamico"""
        try:
            data = request.get_json() or {}
            username = data.get('nextcloud_user')
            password = data.get('nextcloud_password')
            
            if not username or not password:
                return jsonify({"success": False, "message": "Dati di autenticazione Nextcloud incompleti"}), 400
            
            ServicesLayerService.save_nextcloud_config(data)
            
            return jsonify({"success": True, "message": "Configurazione applicativa registrata"}), 200
        except Exception as e:
            return jsonify({"success": False, "message": f"Errore interno: {str(e)}"}), 500

    @staticmethod
    def run_nextcloud_setup():
        """Innesca lo stream reale dei log di Ansible"""
        try:
            # 1. Il Controller orchestra: recupera IP e genera l'inventory
            config_service = ConfigService(base_dir)
            pve_ip = config_service.get_proxmox_ip()
            
            inventory_path = InventoryService.generate_inventory(pve_ip)

            # 2. Passa lo stream pronto al Service
            return Response(
                stream_with_context(ServicesLayerService.execute_nextcloud_stream(inventory_path)), 
                mimetype='application/json',
                headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"}
            )
        except Exception as e:
            return jsonify({"success": False, "message": f"Errore avvio automazione: {str(e)}"}), 500