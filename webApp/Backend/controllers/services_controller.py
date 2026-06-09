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
        """Estrae ed archivia i dati dal payload dinamico inclusa l'allocazione storage iniziale"""
        try:
            data = request.get_json() or {}
            username = data.get('nextcloud_user')
            password = data.get('nextcloud_password')
            
            # Estraiamo anche i dati dello storage passati dal JS
            disk_storage = data.get('nextcloud_disk_storage')
            storage_size = data.get('nextcloud_storage_size') 
            
            # Validazione
            if not username or not password:
                return jsonify({"success": False, "message": "Dati di autenticazione Nextcloud incompleti"}), 400
                
            if not storage_size or not disk_storage:
                return jsonify({"success": False, "message": "Dati di storage (dimensione o pool) non specificati"}), 400

            # Pulizia e formattazione della dimensione (es. trasforma '50' in '50Gi')
            storage_clean = str(storage_size).strip().upper().replace('GI', '')
            if not storage_clean.isdigit():
                return jsonify({"success": False, "message": "Formato dimensione storage non valido"}), 400

            # 1. Creiamo la lista per il PVC (Task 2 di Ansible)
            data['nextcloud_storage_volumes'] = [f"{storage_clean}Gi"]
            
            # 2. Assegniamo il pool NFS dove montarlo
            data['nextcloud_disk_storage'] = disk_storage
            
            # Rimuoviamo la vecchia chiave ridondante prima di salvare
            if 'nextcloud_storage_size' in data:
                del data['nextcloud_storage_size']

            # Invocazione del Service Layer per scrivere nel vars.yml
            ServicesLayerService.save_nextcloud_config(data)
            
            return jsonify({
                "success": True, 
                "message": "Configurazione applicativa e storage registrati con successo"
            }), 200
            
        except Exception as e:
            return jsonify({"success": False, "message": f"Errore interno: {str(e)}"}), 500
        

    @staticmethod
    def expand_nextcloud_storage():
        """Inietta una NUOVA voce di storage e riesegue il build dichiarativo dell'app"""
        try:
            data = request.get_json() or {}
            new_size = data.get('new_size')
            
            if not new_size:
                return jsonify({"success": False, "message": "Dimensione del nuovo entry non pervenuta"}), 400
                
            # 1. Aggiungiamo il record in coda all'array vars
            ServicesLayerService.add_nextcloud_storage_volume(new_size)
            
            # 2. Riparshiamo l'intero deployment. Ansible creerà il nuovo PVC separato!
            return Response(
                ServicesLayerService.execute_nextcloud_stream(), 
                mimetype='application/json',
                headers={"Cache-Control": "no-cache"}
            )
        except Exception as e:
            return jsonify({"success": False, "message": str(e)}), 500
        
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