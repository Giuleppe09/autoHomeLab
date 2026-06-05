import os
from flask import Flask, render_template
from routes.tailscale_routes import tailscale_bp
from routes.config_routes import config_bp
from routes.k3s_routes import k3s_bp
from routes.nfs_routes import nfs_bp
from routes.services_routes import services_bp

base_dir = os.path.dirname(os.path.abspath(__file__))
template_dir = os.path.abspath(os.path.join(base_dir, '..', 'Front-End', 'html'))
static_dir = os.path.abspath(os.path.join(base_dir, '..', 'Front-End'))

app = Flask(__name__, template_folder=template_dir, static_folder=static_dir, static_url_path='/static')
app.secret_key = 'super_secret_homelab_key' 

app.register_blueprint(tailscale_bp)
app.register_blueprint(config_bp)
app.register_blueprint(k3s_bp)
app.register_blueprint(nfs_bp)
app.register_blueprint(services_bp)

# --- ROTTE PAGINE HTML (Totalmente delegate ai Controller) ---

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/config')
def config_page():
    from controllers.config_controller import ConfigController
    return ConfigController.render_config_page()

@app.route('/tailscale')
def tailscale_page():
    from controllers.tailscale_controller import TailscaleController
    return TailscaleController.render_page()

@app.route('/nfs')
def nfs_page():
    from controllers.nfs_controller import NfsController
    return NfsController.render_nfs_page()

@app.route('/k3s')
def k3s_page():
    from controllers.k3s_controller import K3sController
    return K3sController.render_page()

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)