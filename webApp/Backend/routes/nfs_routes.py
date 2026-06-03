from flask import Blueprint, request, Response, stream_with_context
from controllers.nfs_controller import NfsController

nfs_bp = Blueprint('nfs_routes', __name__)

@nfs_bp.route('/api/nfs/storages', methods=['GET'])
def get_nfs_storages():
    return NfsController.get_storages_api()

@nfs_bp.route('/api/nfs/config', methods=['POST'])
def save_nfs_config():
    return NfsController.save_nfs_config(request)

@nfs_bp.route('/api/nfs/setup', methods=['POST'])
def run_nfs_setup():
    return NfsController.handle_setup_request()