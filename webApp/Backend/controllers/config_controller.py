from flask import jsonify, session, Response, stream_with_context
from services.config_service import ConfigService
from services.network_service import NetworkService
from services.proxmox_service import ProxmoxService
import os

# __file__ è in controllers/, quindi saliamo di un livello per ottenere la root Backend/
base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

class ConfigController:

    @staticmethod
    def check_status(request):
        pve_ip = session.get('pve_ip')
        is_online = ProxmoxService.check_status(pve_ip)
        return jsonify({"status": "online" if is_online else "offline"})
    
    @staticmethod
    def init_proxmox(request):
        data = request.get_json()
        pve_ip = data.get('pve_ip')
        if not pve_ip: return "IP mancante", 400
        
        session['pve_ip'] = pve_ip
        
        def generate():
            try:
                for line in ProxmoxService.discover_storages_stream(pve_ip, base_dir):
                    yield line
            except Exception as e:
                yield f"\n❌ Errore: {str(e)}\n"
                
        return Response(stream_with_context(generate()), mimetype='text/plain')

    @staticmethod
    def init_proxmox_finalize(request):
        pve_ip = session.get('pve_ip')
        if not pve_ip: return "Sessione scaduta", 400
        try:
            info = ProxmoxService.read_storages(base_dir)
            session['template_storages'] = info.get('template_storages', [])
            session['disk_storages'] = info.get('disk_storages', [])
            return jsonify({"status": "success"}), 200
        except ValueError as e: return str(e), 400
        except Exception as e: return str(e), 500

    @staticmethod
    def scan_ips(request):
        gw = request.get_json().get('gateway')
        pve_ip = session.get('pve_ip')
        try:
            free_ips = NetworkService.scan_for_free_ips(gw, pve_ip)
            session['cached_free_ips'] = free_ips   
            print(f"DEBUG: Free IPs cached in session: {free_ips}")  # Debug log
            return jsonify({"free_ips": free_ips}), 200
        except ValueError as e: return jsonify({"error": str(e)}), 400
        except Exception as e: return jsonify({"error": f"Errore interno: {str(e)}"}), 500

    @staticmethod
    def save_config(request):
        data = request.get_json()
        pve_ip = session.get('pve_ip')

        # Sicurezza: Estraiamo l'IP puro (senza /24) per validarlo con la memoria del server
        lxc_ip_full = data.get('lxc_ip', '')
        lxc_ip = lxc_ip_full.split('/')[0] if '/' in lxc_ip_full else lxc_ip_full
        
        cached_free_ips = session.get('cached_free_ips')
        
        # Se la lista in sessione è vuota/nulla, l'utente non ha cliccato su "Cerca"
        if cached_free_ips is None:
            return jsonify({"message": "È obbligatorio eseguire la scansione degli IP prima di salvare."}), 400
        elif lxc_ip not in cached_free_ips:
            return jsonify({"message": f"Attenzione: L'IP {lxc_ip} non risulta tra quelli liberi. Esegui nuovamente la scansione."}), 400

        try:
            ConfigService(base_dir).process_and_save(data, pve_ip)
            # Impostiamo una flag in sessione per sbloccare l'accesso allo step 3
            session['config_saved'] = True
            return jsonify({"status": "success", "message": "Configurazione salvata con successo."}), 200
        except ValueError as e: return jsonify({"message": str(e)}), 400
        except Exception as e: return jsonify({"message": f"Errore salvataggio: {str(e)}"}), 500