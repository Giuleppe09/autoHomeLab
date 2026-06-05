let currentService = null;

// 📖 REGISTRO COMPONENTI E CAMPI DINAMICI
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
    `
};

function selectService(serviceName) {
    currentService = serviceName;
    
    // Evidenzia visivamente la card attiva
    document.querySelectorAll('.service-card').forEach(c => c.classList.remove('active'));
    document.getElementById(`card-${serviceName}`).classList.add('active');
    
    // Iniezione HTML dinamico
    const fieldsContainer = document.getElementById('service-fields');
    fieldsContainer.innerHTML = serviceRegistry[serviceName] || '<p>Nessun parametro richiesto per questa applicazione.</p>';
    
    // Gestione UI: Mostra il form e resetta la sezione setup
    document.getElementById('form-title').innerText = `⚙️ Configurazione: ${serviceName.toUpperCase()}`;
    document.getElementById('form-section').classList.remove('hidden');
    
    document.getElementById('setup-section').classList.add('hidden');
    document.getElementById('console-output').classList.add('hidden');
    document.getElementById('console-output').innerText = "In attesa dei processi...\n";
    
    // Reset pulsanti
    document.getElementById('btn-save').disabled = false;
    document.getElementById('btn-save').innerText = "Salva Configurazione";
    document.getElementById('btn-run').disabled = false;
    document.getElementById('btn-run').innerText = "Avvia Deployment";
    document.getElementById('btn-run').classList.replace('btn-secondary', 'btn-primary');
    document.getElementById('btn-home').classList.add('hidden');
}

// ---------------------------------------------------------
// FASE 1: SALVATAGGIO CONFIGURAZIONE
// ---------------------------------------------------------
async function saveServiceConfig() {
    if (!currentService) return;

    const formElement = document.getElementById('dynamic-service-form');
    const formData = new FormData(formElement);
    const payload = Object.fromEntries(formData.entries());

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

        // Se va a buon fine, nascondi il form e mostra la sezione "Avvia"
        document.getElementById('form-section').classList.add('hidden');
        document.getElementById('setup-title').innerText = `🚀 Deploy ${currentService.toUpperCase()}`;
        document.getElementById('setup-section').classList.remove('hidden');

    } catch (error) {
        alert("Errore: " + error.message);
        btnSave.disabled = false;
        btnSave.innerText = "Salva Configurazione";
    }
}

// ---------------------------------------------------------
// FASE 2: ESECUZIONE ANSIBLE E STREAMING
// ---------------------------------------------------------
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
                } catch (e) {
                    // Ignora righe non JSON
                }
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