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
            <label for="nextcloud_disk_storage">Storage di Destinazione per i Dati</label>
            <select id="nextcloud_disk_storage" name="nextcloud_disk_storage" class="form-control default-select" required>
                <option value="">Caricamento storage in corso...</option>
            </select>
            <small id="storage-info-helper" style="color: #a9b1d6; display:block; margin-top: 5px;">⏳ Interrogazione capacità Proxmox in corso...</small>
        </div>
        <div class="form-group" id="nextcloud_storage_size_container" style="display: none;">
            <label for="nextcloud_storage_size">Quota Storage per Dati Utente: <span id="storage-val" style="font-weight: bold; color: #7aa2f7;">50</span> GB</label>
            <div style="display: flex; align-items: center; gap: 10px;">
                <span id="range-min" style="font-size: 0.8rem; color: #a9b1d6;">5GB</span>
                <input type="range" id="nextcloud_storage_size" name="nextcloud_storage_size" class="form-control-range" value="50" min="5" max="100" step="1" required style="flex-grow: 1;">
                <span id="range-max" style="font-size: 0.8rem; color: #a9b1d6;">100GB</span>
            </div>
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
    const storageSelect = document.getElementById('nextcloud_disk_storage');
    const storageInput = document.getElementById('nextcloud_storage_size');
    const storageVal = document.getElementById('storage-val');
    const rangeMax = document.getElementById('range-max');
    const sliderContainer = document.getElementById('nextcloud_storage_size_container');
    
    try {
        const response = await fetch('/api/storages');
        const data = await response.json();
        
        if (response.ok && data.disk_storages && data.disk_storages.length > 0) {
            proxmoxStorages = data.disk_storages;
            
            // Popoliamo la select degli storage dinamicamente
            storageSelect.innerHTML = '';
            proxmoxStorages.forEach(s => {
                const opt = document.createElement('option');
                opt.value = s.name;
                opt.text = `${s.name} (${s.free_gb} GB liberi su ${s.total_gb} GB)`;
                if (s.name === 'Storage-1TB' || s.name === 'local-lvm') opt.selected = true;
                storageSelect.appendChild(opt);
            });
            
            // Mostra lo slider ora che i dati reali sono disponibili
            if (sliderContainer) sliderContainer.style.display = 'block';
            
            // Funzione per aggiornare dinamicamente il limite della manopola (range)
            const updateSlider = () => {
                const selectedStorage = proxmoxStorages.find(s => s.name === storageSelect.value) || proxmoxStorages[0];
                if (selectedStorage) {
                    const maxFree = Math.floor(selectedStorage.free_gb);
                    storageInput.max = maxFree > 5 ? maxFree : 5;
                    rangeMax.innerText = storageInput.max + "GB";
                    
                    if (parseInt(storageInput.value) > storageInput.max) {
                        storageInput.value = storageInput.max;
                    }
                    storageVal.innerText = storageInput.value;
                    helper.innerHTML = `ℹ️ Spazio su [<b>${selectedStorage.name}</b>]: ${selectedStorage.free_gb} GB liberi su ${selectedStorage.total_gb} GB totali.`;
                }
            };
            
            storageSelect.addEventListener('change', updateSlider);
            storageInput.addEventListener('input', () => {
                storageVal.innerText = storageInput.value;
            });
            
            // Trigger iniziale per impostare la manopola sul primo storage
            updateSlider();
        } else {
            helper.innerText = "⚠️ Impossibile leggere i dettagli dello storage. Inserimento libero attivo.";
            if (storageSelect) storageSelect.innerHTML = '<option value="">Nessun storage compatibile trovato</option>';
        }
    } catch (e) {
        helper.innerText = "❌ Errore di connessione con l'API Storage di Proxmox.";
        if (storageSelect) storageSelect.innerHTML = '<option value="">Errore di rete</option>';
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
    if (btnSave) {
        btnSave.disabled = true;
        btnSave.innerText = "⏳ Salvataggio parametri...";
    }

    try {
        const configResponse = await fetch(`/api/services/${currentService}/config`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!configResponse.ok) {
            let errorMsg = "Errore durante il salvataggio dei parametri.";
            try {
                const err = await configResponse.json();
                errorMsg = err.message || err.error || errorMsg;
            } catch (e) {
                errorMsg = `Errore HTTP ${configResponse.status} dal server. L'endpoint backend non è configurato correttamente.`;
            }
            throw new Error(errorMsg);
        }

        const formSection = document.getElementById('form-section');
        const setupTitle = document.getElementById('setup-title');
        const setupSection = document.getElementById('setup-section');
        
        if (formSection) formSection.classList.add('hidden');
        if (setupTitle) setupTitle.innerText = `🚀 Deploy ${currentService.toUpperCase()}`;
        if (setupSection) setupSection.classList.remove('hidden');

    } catch (error) {
        alert("❌ Errore: " + error.message);
        if (btnSave) {
            btnSave.disabled = false;
            btnSave.innerText = "Salva Configurazione";
        }
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
                    
                    if (parsed.success === true) {
                        const btnHome = document.getElementById('btn-home');
                        btnHome.classList.remove('hidden');
                        btnHome.disabled = false;
                        
                        btnRun.classList.replace('btn-primary', 'btn-secondary');
                        btnRun.innerText = "Completato ✔️";

                        // Se il backend ha restituito un URL (es. Nextcloud) lo mostriamo a schermo
                        if (parsed.url) {
                            const urlContainer = document.getElementById('success-url-container');
                            const linkElement = document.getElementById('nextcloud-link');
                            if (urlContainer && linkElement) {
                                linkElement.href = parsed.url;
                                linkElement.innerText = parsed.url;
                                urlContainer.classList.remove('hidden');
                            }
                        }
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
                        btnHome.onclick = () => window.location.href = '/dashboard';
                        
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