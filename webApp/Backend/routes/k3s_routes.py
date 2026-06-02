from flask import Blueprint, request
from controllers.k3s_controller import K3sController

k3s_bp = Blueprint('k3s_routes', __name__)

@k3s_bp.route('/api/k3s/config', methods=['POST'])
def save_k3s_config():
    return K3sController.save_k3s_config(request)

@k3s_bp.route('/api/k3s/setup', methods=['POST'])
def run_k3s_setup():
    return K3sController.run_k3s_setup()