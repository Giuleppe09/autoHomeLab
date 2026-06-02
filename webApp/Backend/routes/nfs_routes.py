from flask import Blueprint, request, Response, stream_with_context
from controllers.nfs_controller import NfsController
from services.nfs_service import NfsService

nfs_bp = Blueprint('nfs_routes', __name__)

@nfs_bp.route('/api/nfs/config', methods=['POST'])
def save_nfs_config():
    return NfsController.save_nfs_config(request)

@nfs_bp.route('/api/nfs/setup', methods=['POST'])
def run_nfs_setup():
    data = request.json or {}
    pve_ip = data.get('proxmox_ip')
    return Response(
        stream_with_context(NfsService.execute_nfs_setup_stream(pve_ip)),
        mimetype='application/json'
    )