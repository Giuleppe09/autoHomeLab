from flask import Blueprint, request, jsonify, Response
from services.services_layer_service import ServicesLayerService

nextcloud_bp = Blueprint('nextcloud', __name__)

# API Step 1: Validazione Spazio Fisico & Scrittura YAML (vars.yml)
@nextcloud_bp.route('/api/nextcloud/expand', methods=['POST'])
def expand_storage():
    data = request.json or {}
    add_gb = data.get('add_gb')
    
    if not add_gb:
        return jsonify({"success": False, "error": "Parametro add_gb mancante o non valido"}), 400
        
    # Gestione logica nel ServiceLayer che garantisce rollback su file system e verifica PVE
    result, status_code = ServicesLayerService.expand_nextcloud_storage(add_gb)
    
    return jsonify(result), status_code

# API Step 2: Applicazione K8s Patch & Streaming
@nextcloud_bp.route('/api/nextcloud/expand/stream', methods=['POST'])
def expand_storage_stream():
    data = request.json or {}
    new_size = data.get('new_size')
    inventory_path = data.get('inventory_path', '/root/inventory.ini') # Parametrizza col path reale del tuo inventory
    
    if not new_size:
        return jsonify({"success": False, "error": "Nuova dimensione (new_size) non definita"}), 400
        
    return Response(
        ServicesLayerService.execute_nextcloud_resize_stream(inventory_path, new_size),
        mimetype='application/json'
    )