from flask import Blueprint, request
from controllers.config_controller import ConfigController
from controllers.nfs_controller import NfsController

config_bp = Blueprint('config_bp', __name__)

@config_bp.route('/api/check_status', methods=['GET'])
def check_status():
    return ConfigController.check_status(request)

@config_bp.route('/api/storages', methods=['GET'])
def get_nfs_storages():
    return ConfigController.get_storages_api()


@config_bp.route('/api/init_proxmox', methods=['POST'])
def init_proxmox():
    return ConfigController.init_proxmox_api(request)

@config_bp.route('/api/scan_ips', methods=['POST'])
def scan_ips():
    return ConfigController.scan_ips(request)

@config_bp.route('/api/config', methods=['POST'])
def save_config():
    return ConfigController.save_config(request)