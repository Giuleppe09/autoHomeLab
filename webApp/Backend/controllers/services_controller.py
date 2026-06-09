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
        """Estrae ed archivia i dati dal payload web, validandoli (Service Layer)"""
        try:
            data = request.get_json() or {}
            username = data.get('nextcloud_user')
            password = data.get('nextcloud_password')
            storage_size = data.get('nextcloud_storage_size') 
            
            # Validazione dei campi
            if not username or not password:
                return jsonify({"success": False, "message": "Dati di autenticazione Nextcloud incompleti"}), 400
                
            if not storage_size:
                return jsonify({"success": False, "message": "Dimensione della quota di storage non specificata"}), 400

            # Pulizia e formattazione della dimensione
            storage_clean = str(storage_size).strip().upper().replace('GI', '')
            if not storage_clean.isdigit():
                return jsonify({"success": False, "message": "Formato dimensione storage non valido"}), 400

            # Creazione dell'array per il PVC di K3s
            data['nextcloud_storage_volumes'] = [f"{storage_clean}Gi"]
            
            # Pulizia delle chiavi temporanee usate dal front-end
            if 'nextcloud_storage_size' in data:
                del data['nextcloud_storage_size']
            if 'nextcloud_disk_storage' in data:
                del data['nextcloud_disk_storage']

            # Invocazione del Service Layer VERO passandogli il dizionario pulito
            ServicesLayerService.save_nextcloud_config(data)
            
            return jsonify({
                "success": True, 
                "message": "Configurazione applicativa e quota storage registrate con successo"
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
    
    @staticmethod
    def get_storage_accounting():
        """
        Restituisce lo stato aggregato dello storage 
        dell'intero cluster K3s sommando tutti i servizi.
        """
        # Validazione di base (opzionale ma buona pratica)
        try:
            accounting = ServicesLayerService.get_storage_accounting()
            
            return jsonify({
                "success": True,
                "global_allocated_gb": accounting["global_allocated_gb"],
                "safe_free": accounting["safe_free"],
                "services_breakdown": accounting["services_breakdown"] 
            }), 200
            
        except Exception as e:
            return jsonify({
                "success": False, 
                "message": f"Errore calcolo storage globale: {str(e)}"
            }), 500