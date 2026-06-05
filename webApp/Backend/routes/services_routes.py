from flask import Blueprint
from controllers.services_controller import ServicesController

services_bp = Blueprint('services_bp', __name__)

@services_bp.route('/services', methods=['GET'])
def render_services_page():
    return ServicesController.render_page()

@services_bp.route('/api/services/nextcloud/config', methods=['POST'])
def save_nextcloud_config():
    return ServicesController.save_nextcloud_config()

@services_bp.route('/api/services/nextcloud/setup', methods=['POST'])
def run_nextcloud_setup():
    return ServicesController.run_nextcloud_setup()