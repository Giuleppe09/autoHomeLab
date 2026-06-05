let currentService = null;
let proxmoxStorages = [];

// 📖 REGISTRO COMPONENTI DINAMICI
const serviceRegistry = {
    'nextcloud': `
        <div class="form-group">
            <label for="nextcloud_user">Username Amministratore Nextcloud</label>
            <input type="text" id="nextcloud_user" name="nextcloud_user" class="form-control" value="admin" placeholder="es. admin" required>
        </div>
        <div class="form-group">
            <label for="nextcloud_password">Password Amministratore Nextcloud</label>
            <input type="password" id="nextcloud_password" name="nextcloud_password" class="form-control" placeholder="Inserisci una password sicura" required>
        </div>
        <div class="form-group">
            <label for="nextcloud_storage_size">Quota Storage per Dati Utente (GB)</label>
            <input type="number" id="nextcloud_storage_size" name="nextcloud_storage_size" class="form-control" value="50" min="5" required>
            <small id="storage-info-helper" style="color: #a9b1d6; display:block; margin-top: 5px;">⏳ Interrogazione capacità Proxmox in corso...</small>
        </div>
    `
};

async function selectService(serviceName) {
    currentService = serviceName;
    
    // Evidenzia visivamente la card attiva
    document.querySelectorAll('.service-card').forEach(c => c.classList.remove('active'));
    document.getElementById(`card-${serviceName}`).classList.add('active');
    
    // Iniezione HTML dinamico del form
    const fieldsContainer = document.getElementById('service-fields');
    fieldsContainer.innerHTML = serviceRegistry[serviceName] || '<p>Nessun parametro richiesto per questa applicazione.</p>';
    
    // Mostra le sezioni grafiche corrette
    document.getElementById('form-title').innerText = `⚙️ Configurazione: ${serviceName.toUpperCase()}`;
    document.getElementById('form-section').classList.remove('hidden');
    document.getElementById('setup-section').classList.add('hidden');
    
    // Recupera in tempo reale le informazioni reali sullo storage da Proxmox
    if (serviceName === 'nextcloud') {
        await updateStorageHelperInfo();
    }
}

async function updateStorageHelperInfo() {
    const helper = document.getElementById('storage-info-helper');
    const storageInput = document.getElementById('nextcloud_storage_size');
    
    try {
        const response = await fetch('/api/storages');
        const data = await response.json();
        
        if (response.ok && data.storages && data.storages.length > 0) {
            // Cerchiamo lo storage condiviso o quello usato di solito per i dischi (es: local-lvm o Storage-1TB)
            // Se hai un filtro specifico puoi applicarlo, altrimenti mostriamo lo spazio del primo disponibile
            const mainStorage = data.storages.find(s => s.name === 'Storage-1TB') || data.storages[0];
            
            if (mainStorage) {
                helper.innerHTML = `ℹ️ Spazio su Proxmox [<b>${mainStorage.name}</b>]: ${mainStorage.free_gb} GB liberi di ${mainStorage.total_gb} GB totali.`;
                // Vincoliamo l'input del form per non superare lo spazio fisico disponibile
                storageInput.max = Math.floor(mainStorage.free_gb);
                storageInput.placeholder = `Max ${Math.floor(mainStorage.free_gb)} GB`;
            }
        } else {
            helper.innerText = "⚠️ Impossibile leggere i dettagli dello storage. Inserimento libero attivo.";
        }
    } catch (e) {
        helper.innerText = "❌ Errore di connessione con l'API Storage di Proxmox.";
    }
}

// FASE 1: SALVATAGGIO CONFIGURAZIONE
async function saveServiceConfig() {
    if (!currentService) return;

    const formElement = document.getElementById('dynamic-service-form');
    const formData = new FormData(formElement);
    const payload = Object.fromEntries(formData.entries());

    // Validazione preventiva lato client sullo spazio massimo inserito
    const storageInput = document.getElementById('nextcloud_storage_size');
    if (storageInput && storageInput.max && parseFloat(payload.nextcloud_storage_size) > parseFloat(storageInput.max)) {
        alert(`Errore: Non puoi allocare ${payload.nextcloud_storage_size} GB. Lo storage Proxmox ha solo ${storageInput.max} GB liberi!`);
        return;
    }

    const btnSave = document.getElementById('btn-save');
    btnSave.disabled = true;
    btnSave.innerText = "Salvataggio parametri...";

    try {
        const configResponse = await fetch(`/api/services/${currentService}/config`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!configResponse.ok) {
            const err = await configResponse.json();
            throw new Error(err.message || "Errore durante il salvataggio dei parametri");
        }

        document.getElementById('form-section').classList.add('hidden');
        document.getElementById('setup-title').innerText = `🚀 Deploy ${currentService.toUpperCase()}`;
        document.getElementById('setup-section').classList.remove('hidden');

    } catch (error) {
        alert("Errore: " + error.message);
        btnSave.disabled = false;
        btnSave.innerText = "Salva Configurazione";
    }
}

// FASE 2: ESECUZIONE ANSIBLE STREAMING
async function runServiceSetup() {
    const btnRun = document.getElementById('btn-run');
    const consoleOutput = document.getElementById('console-output');

    btnRun.disabled = true;
    btnRun.innerText = "⏳ Installazione in corso...";
    
    consoleOutput.classList.remove('hidden');
    consoleOutput.innerText = `Inizializzazione playbook Ansible per il deploy di ${currentService}...\n\n`;

    try {
        const setupResponse = await fetch(`/api/services/${currentService}/setup`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({})
        });

        const reader = setupResponse.body.getReader();
        const decoder = new TextDecoder("utf-8");
        let buffer = "";

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop();

            for (const line of lines) {
                if (!line.trim()) continue;
                try {
                    const parsed = JSON.parse(line);
                    
                    if (parsed.success === false && parsed.message) {
                         consoleOutput.innerText += "\n❌ Errore critico backend: " + parsed.message;
                         throw new Error("Interruzione");
                    }

                    if (parsed.log) {
                        if (parsed.log.includes("PLAY [")) consoleOutput.innerText = "";
                        consoleOutput.innerText += parsed.log;
                        consoleOutput.scrollTop = consoleOutput.scrollHeight;
                    }

                    if (parsed.success === true) {
                        const btnHome = document.getElementById('btn-home');
                        btnHome.classList.remove('hidden');
                        btnHome.disabled = false;
                        
                        btnRun.classList.replace('btn-primary', 'btn-secondary');
                        btnRun.innerText = "Completato ✔️";
                    }
                } catch (e) {}
            }
        }
    } catch (error) {
        if (error.message !== "Interruzione") {
            consoleOutput.innerText += "\n❌ Errore di rete o server: " + error.message;
        }
        btnRun.disabled = false;
        btnRun.innerText = "Riprova Deployment";
    }
}