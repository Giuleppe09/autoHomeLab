let currentService = null;

// 📖 REGISTRO COMPONENTI DINAMICI (Solo parametri logici, zero riferimenti hardware)
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
            <small id="storage-info-helper" style="color: #a9b1d6; display:block; margin-bottom: 10px;">
                ⏳ Interrogazione capacità di storage del cluster in corso...
            </small>
            
            <div id="nextcloud_storage_size_container" style="display: none; background: #1c1f30; padding: 15px; border-radius: 5px; border: 1px solid #414868;">
                <label for="nextcloud_storage_size">Quota Storage Iniziale per il Servizio: <span id="storage-val" style="font-weight: bold; color: #7aa2f7;">50</span> GB</label>
                <div style="display: flex; align-items: center; gap: 10px; margin-top: 10px;">
                    <span id="range-min" style="font-size: 0.8rem; color: #a9b1d6;">5GB</span>
                    <input type="range" id="nextcloud_storage_size" name="nextcloud_storage_size" class="form-control-range" value="50" min="5" max="100" step="1" required style="flex-grow: 1;">
                    <span id="range-max" style="font-size: 0.8rem; color: #a9b1d6;">100GB</span>
                </div>
            </div>
        </div>
    `
};

// 1. SELEZIONE DEL SERVIZIO DALLA GRID
async function selectService(serviceName) {
    currentService = serviceName;
    
    // Evidenzia visivamente la card attiva
    document.querySelectorAll('.service-card').forEach(c => c.classList.remove('active'));
    document.getElementById(`card-${serviceName}`).classList.add('active');
    
    // Iniezione HTML dei soli campi necessari
    const fieldsContainer = document.getElementById('service-fields');
    fieldsContainer.innerHTML = serviceRegistry[serviceName] || '<p>Nessun parametro richiesto per questa applicazione.</p>';
    
    document.getElementById('form-title').innerText = `⚙️ Configurazione Parametri: ${serviceName.toUpperCase()}`;
    
    // Nasconde preventivamente la sezione di setup/deploy
    const setupSection = document.getElementById('setup-section');
    if (setupSection) {
        setupSection.classList.add('hidden');
        setupSection.style.display = 'none';
    }
    
    // Disabilita cautelativamente il tasto Salva in attesa del check dello storage
    const btnSave = document.getElementById('btn-save');
    if (btnSave) {
        btnSave.disabled = true;
        btnSave.innerText = "⏳ Controllo spazio sicuro nel cluster...";
    }
    
    // Interroga l'accounting globale dello storage
    if (serviceName === 'nextcloud') {
        await updateStorageHelperInfo();
    }

    // Mostra la sezione di configurazione parametri solo dopo il check
    const formSection = document.getElementById('form-section');
    if (formSection) {
        formSection.classList.remove('hidden');
        formSection.style.display = 'block'; 
    }
}

// 2. CALCOLO DINAMICO DELLO SPAZIO DISPONIBILE (INTERFACCIATO CON LA TUA API DI ACCOUNTING)
async function updateStorageHelperInfo() {
    const helper = document.getElementById('storage-info-helper');
    const storageInput = document.getElementById('nextcloud_storage_size');
    const storageVal = document.getElementById('storage-val');
    const rangeMax = document.getElementById('range-max');
    const sliderContainer = document.getElementById('nextcloud_storage_size_container');
    const btnSave = document.getElementById('btn-save');
    
    try {
        // Chiama l'API di contabilità dello storage centralizzato (NFS/K3s)
        const response = await fetch('/api/services/storage_accounting');
        const data = await response.json();
        
        if (response.ok && data.success) {
            const maxFree = Math.floor(data.safe_free);

            // Se lo spazio residuo è inferiore alla quota minima di Nextcloud (5GB), blocca l'azione
            if (maxFree < 5) {
                helper.innerHTML = `❌ Spazio sicuro insufficiente nel cluster (${maxFree} GB rimasti). Minimo richiesto: 5 GB.`;
                if (btnSave) {
                    btnSave.disabled = true;
                    btnSave.innerText = "❌ Spazio Insufficiente nel Cluster";
                }
                return;
            }

            // Configura dinamicamente i limiti della manopola dello slider sulla base del safe_free reale
            storageInput.max = maxFree;
            rangeMax.innerText = maxFree + "GB";
            
            if (parseInt(storageInput.value) > maxFree) {
                storageInput.value = maxFree;
            }
            storageVal.innerText = storageInput.value;
            
            helper.innerHTML = `✅ Capacità verificata. Spazio sicuro disponibile nel cluster: <b>${maxFree} GB</b>.`;
            if (sliderContainer) sliderContainer.style.display = 'block';

            // Listener per aggiornare il numeretto dei GB mentre l'utente sposta la manopola
            storageInput.addEventListener('input', () => {
                storageVal.innerText = storageInput.value;
            });

            // Sblocca il pulsante di configurazione ora che i controlli sono superati
            if (btnSave) {
                btnSave.disabled = false;
                btnSave.innerText = "Salva Configurazione";
            }
        } else {
            helper.innerText = "❌ Impossibile determinare lo stato dello storage: " + (data.message || "Errore API");
            if (btnSave) btnSave.innerText = "❌ Configurazione Bloccata";
        }
    } catch (e) {
        helper.innerText = "❌ Errore critico di comunicazione con l'API Storage del Service Layer.";
        if (btnSave) btnSave.innerText = "❌ Configurazione Bloccata (Errore di Rete)";
    }
}

// 3. SALVATAGGIO CONFIGURAZIONE (FASE 1)
async function saveServiceConfig() {
    if (!currentService) return;

    const formElement = document.getElementById('dynamic-service-form');
    const formData = new FormData(formElement);
    const payload = Object.fromEntries(formData.entries());

    // Validazione preventiva di sicurezza lato client sullo spazio massimo inseribile
    const storageInput = document.getElementById('nextcloud_storage_size');
    if (storageInput && storageInput.max && parseFloat(payload.nextcloud_storage_size) > parseFloat(storageInput.max)) {
        alert(`Errore: Non puoi allocare ${payload.nextcloud_storage_size} GB. Lo storage ha solo ${storageInput.max} GB sicuri residui!`);
        return;
    }

    const btnSave = document.getElementById('btn-save');
    if (btnSave) {
        btnSave.disabled = true;
        btnSave.innerText = "⏳ Scrittura parametri nel sistema...";
    }

    try {
        // Invia la richiesta POST all'endpoint che hai condiviso
        const configResponse = await fetch(`/api/services/${currentService}/config`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const responseData = await configResponse.json();

        // Legge la risposta del tuo backend (success: true)
        if (configResponse.ok && responseData.success) {
            
            // Nasconde il form parametri
            const formSection = document.getElementById('form-section');
            if (formSection) {
                formSection.classList.add('hidden');
                formSection.style.display = 'none';
            }

            // Mostra la sezione e sblocca il pulsante di Deploy
            const setupSection = document.getElementById('setup-section');
            const setupTitle = document.getElementById('setup-title');
            
            if (setupTitle) setupTitle.innerText = `🚀 Deploy ${currentService.toUpperCase()}`;
            if (setupSection) {
                setupSection.classList.remove('hidden');
                setupSection.style.display = 'block'; 
            }

            const urlContainer = document.getElementById('success-url-container');
            if (urlContainer) urlContainer.classList.add('hidden');

        } else {
            throw new Error(responseData.message || "Risposta negativa dal server.");
        }

    } catch (error) {
        alert("❌ Errore durante il salvataggio: " + error.message);
        if (btnSave) {
            btnSave.disabled = false;
            btnSave.innerText = "Salva Configurazione";
        }
    }
}

// 4. ESECUZIONE ANSIBLE IN REAL-TIME STREAMING (FASE 2)
async function runServiceSetup() {
    const btnRun = document.getElementById('btn-run');
    const consoleOutput = document.getElementById('console-output');
    const urlContainer = document.getElementById('success-url-container');

    btnRun.disabled = true;
    btnRun.innerText = "⏳ Distribuzione in corso...";
    
    if (urlContainer) urlContainer.classList.add('hidden');
    
    consoleOutput.classList.remove('hidden');
    consoleOutput.style.display = 'block';
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
                        if (btnHome) {
                            btnHome.classList.remove('hidden');
                            btnHome.style.display = 'inline-block';
                            btnHome.disabled = false;
                            btnHome.onclick = () => window.location.href = '/dashboard';
                        }
                        
                        btnRun.classList.replace('btn-primary', 'btn-secondary');
                        btnRun.innerText = "Completato ✔️";

                        if (parsed.url && urlContainer) {
                            const linkElement = document.getElementById('nextcloud-link');
                            if (linkElement) {
                                linkElement.href = parsed.url;
                                linkElement.innerText = parsed.url;
                            }
                            urlContainer.classList.remove('hidden');
                            urlContainer.style.display = 'block';
                        }
                    }

                    if (parsed.log) {
                        if (parsed.log.includes("PLAY [")) consoleOutput.innerText = "";
                        consoleOutput.innerText += parsed.log;
                        consoleOutput.scrollTop = consoleOutput.scrollHeight;
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