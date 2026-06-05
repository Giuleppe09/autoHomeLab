from flask import Blueprint
from controllers.k3s_controller import K3sController

# Definizione del Blueprint per il modulo K3s
k3s_bp = Blueprint('k3s_bp', __name__)

@k3s_bp.route('/api/k3s/config', methods=['POST'])
def save_k3s_config():
    """Rotta per salvare i parametri inseriti dall'utente nel form"""
    return K3sController.save_config()

@k3s_bp.route('/api/k3s/setup', methods=['POST'])
def run_k3s_setup():
    """Rotta per avviare l'esecuzione dei Playbook Ansible in streaming"""
    return K3sController.run_setup()