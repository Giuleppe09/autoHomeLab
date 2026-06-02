from flask import Blueprint, request
from controllers.config_controller import ConfigController

config_bp = Blueprint('config_bp', __name__)

@config_bp.route('/api/check_status', methods=['GET'])
def check_status():
    return ConfigController.check_status(request)

@config_bp.route('/api/init_proxmox', methods=['POST'])
def init_proxmox():
    return ConfigController.init_proxmox(request)

@config_bp.route('/api/init_proxmox_finalize', methods=['POST'])
def init_proxmox_finalize():
    return ConfigController.init_proxmox_finalize(request)

@config_bp.route('/api/scan_ips', methods=['POST'])
def scan_ips():
    return ConfigController.scan_ips(request)

@config_bp.route('/api/config', methods=['POST'])
def save_config():
    return ConfigController.save_config(request)