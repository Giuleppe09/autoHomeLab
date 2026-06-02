import os # Importa il modulo os per gestire i percorsi dei file   
from flask import Flask, render_template, request, jsonify, session
from routes.tailscale_routes import tailscale_bp #Importa il Blueprint per le rotte di Tailscale 
from routes.config_routes import config_bp #Importa il Blueprint per le rotte di configurazione
from routes.k3s_routes import k3s_bp #Importa il Blueprint per le rotte di K3s
from routes.nfs_routes import nfs_bp #Importa il Blueprint per le rotte di NFS

# Otteniamo il percorso assoluto della cartella Backend
base_dir = os.path.dirname(os.path.abspath(__file__))
# Puntiamo correttamente alle cartelle nel Front-End
template_dir = os.path.abspath(os.path.join(base_dir, '..', 'Front-End', 'html'))
static_dir = os.path.abspath(os.path.join(base_dir, '..', 'Front-End'))

# Creazione dell'app Flask con i percorsi corretti per template e static files
app = Flask(__name__,
            template_folder=template_dir,
            static_folder=static_dir,
            static_url_path='/static')

# Impostiamo una secret key necessaria per gestire i dati in sessione
app.secret_key = 'super_secret_homelab_key' 
# Non è importante dato che stiamo lavorando in locale, in termini di crittografia, ma è necessario per utilizzare le sessioni in Flask

# Registrazione delle rotte (Blueprint)
app.register_blueprint(tailscale_bp)
app.register_blueprint(config_bp)
app.register_blueprint(k3s_bp)
app.register_blueprint(nfs_bp)

# Rotte per le pagine HTML
@app.route('/')
def index():
    # Verifichiamo se il file esiste prima di caricarlo per evitare errori silenziosi
    if not os.path.exists(os.path.join(template_dir, 'index.html')):
        return "ERRORE: index.html non trovato in " + template_dir
    return render_template('index.html')

@app.route('/config')
def config_page():
    if not os.path.exists(os.path.join(template_dir, 'config.html')):
        return "ERRORE: config.html non trovato in " + template_dir
        
    # Recuperiamo gli storage trovati da Proxmox (o impostiamo dei fallback sicuri)
    template_storages = session.get('template_storages', ['local'])

    return render_template('config.html', template_storages=template_storages, disk_storages=disk_storages)

@app.route('/tailscale')
def tailscale_page():
    if not os.path.exists(os.path.join(template_dir, 'tailscale.html')):
        return "ERRORE: tailscale.html non trovato in " + template_dir
    return render_template('tailscale.html')

@app.route('/nfs')
def nfs_page():
    if not os.path.exists(os.path.join(template_dir, 'config_nfs.html')):
        return "ERRORE: config_nfs.html non trovato in " + template_dir
    template_storages = session.get('template_storages', ['local'])
    disk_storages = session.get('disk_storages', ['local', 'local-lvm'])
    return render_template('config_nfs.html', template_storages=template_storages, disk_storages=disk_storages)

@app.route('/k3s')
def k3s_page():
    if not os.path.exists(os.path.join(template_dir, 'k3s.html')):
        return "ERRORE: k3s.html non trovato in " + template_dir
    return render_template('k3s.html')

if __name__ == '__main__':
    # Aggiungi debug=True per lo sviluppo
    app.run(host='0.0.0.0', port=5000, debug=True) 