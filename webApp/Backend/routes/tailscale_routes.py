from flask import Blueprint, jsonify
from controllers.tailscale_controller import TailscaleController

tailscale_bp = Blueprint('tailscale', __name__)
controller = TailscaleController()

@tailscale_bp.route('/api/tailscale/status', methods=['GET'])
def get_status():
    return controller.get_status()

@tailscale_bp.route('/api/tailscale/setup', methods=['POST'])
def run_setup():
    return controller.run_setup()

@tailscale_bp.route('/api/tailscale/config', methods=['POST'])
def save_config():
    return controller.save_config()