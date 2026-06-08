import subprocess
import os
import json
from daos.tailscale_dao import TailscaleDAO

class TailscaleService:
    def __init__(self):
        self.dao = TailscaleDAO()
        self.scripts_path = os.path.join(self.dao.base_path, "script")

    def save_parameters(self, data):
        return self.dao.save_config(data)

    def execute_setup_stream(self, inventory_path):
        # NIENTE PIÙ CHIAMATE AD ALTRI SERVICE QUI!
        if not inventory_path:
            yield json.dumps({"success": False, "log": "\n❌ Errore: inventory path mancante.\n"}) + "\n"
            return

        playbooks = ["1_create_lxc.yml", "2_install_tailscale.yml", "3_setup_local_pc.yml"]
        env = os.environ.copy()
        env["ANSIBLE_HOST_KEY_CHECKING"] = "False"
        env["PYTHONUNBUFFERED"] = "1"
        
        for pb in playbooks:
            pb_path = os.path.join(self.scripts_path, pb)
            yield json.dumps({"log": f"\n\n▶️ Esecuzione di: {pb}...\n{'-'*40}\n"}) + "\n"
            cmd = ["ansible-playbook", "-i", inventory_path, pb_path]
            process = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1, env=env)
            for line in iter(process.stdout.readline, ''):
                yield json.dumps({"log": line}) + "\n"
            process.stdout.close()
            process.wait()
            if process.returncode != 0:
                yield json.dumps({"success": False, "log": f"\n❌ Errore in {pb} (Codice: {process.returncode}).\n"}) + "\n"
                break
        else:
            yield json.dumps({"success": True, "log": "\n✅ Playbook eseguiti con successo!\n"}) + "\n"