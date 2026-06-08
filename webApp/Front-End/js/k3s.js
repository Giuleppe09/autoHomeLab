let k3sConfigData = null;

async function fetchStoragesK3s() {
    const btn = document.getElementById('btn-fetch-storages-k3s');
    const templateSelect = document.getElementById('k3s_template_storage');
    const diskSelect = document.getElementById('k3s_disk_storage');

    btn.disabled = true;
    btn.innerText = "⏳ Lettura in corso...";

    try {
        // NOTA: Se su NFS usi una rotta diversa per gli storage (es. /api/proxmox/storages), modificala qui!
        const response = await fetch('/api/storages'); 
        const data = await response.json();
        
        if (response.ok) {
            // FIX: Copre ogni possibile struttura JSON restituita dal tuo backend (data.storages o data.disk_storages)
            const storagesArray = data.disk_storages || data.storages || (Array.isArray(data) ? data : []);
            
            populateSelect(templateSelect, storagesArray, "Storage-1TB");
            populateSelect(diskSelect, storagesArray, "local-lvm");
            btn.innerText = "✅ Trovati";
            btn.style.backgroundColor = "#9ece6a";
            btn.style.color = "#1a1b26";
        } else {
            alert("Errore API: " + (data.error || "Sconosciuto"));
            btn.innerText = "❌ Riprova";
        }
    } catch (error) {
        alert("Impossibile connettersi per leggere gli storage.");
        btn.innerText = "❌ Errore Rete";
    } finally {
        setTimeout(() => { 
            btn.disabled = false; 
            if(btn.innerText.includes("Riprova") || btn.innerText.includes("Errore")) {
                btn.innerText = "🔄 Cerca Storage";
            }
        }, 3000);
    }
}

function populateSelect(selectElement, optionsArray, defaultPreferred) {
    selectElement.innerHTML = '<option value="">Seleziona Storage...</option>';
    if (optionsArray && optionsArray.length > 0) {
        optionsArray.forEach(opt => {
            const option = document.createElement('option');
            option.value = opt.name; 
            option.text = `${opt.name} (${opt.free_gb} GB liberi su ${opt.total_gb} GB)`;
            if (opt.name === defaultPreferred) option.selected = true;
            selectElement.appendChild(option);
        });
    } else {
        selectElement.innerHTML = '<option value="">Nessuno storage trovato</option>';
    }
}

function enableK3sScan() {
    const gw = document.getElementById('gateway').value.trim();
    const btn = document.getElementById('btn-scan-k3s');
    btn.disabled = !gw.match(/^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/);
}

async function scanFreeIPsK3s() {
    const gw = document.getElementById('gateway').value.trim();
    const btn = document.getElementById('btn-scan-k3s');
    const ipFields = ['k3s_server_ip', 'k3s_agent_ip'];
    
    ipFields.forEach(id => {
        let el = document.getElementById(id);
        if (el && el.tagName.toLowerCase() === 'input') {
            const newSelect = document.createElement('select');
            newSelect.id = el.id;
            newSelect.className = el.className;
            el.parentNode.replaceChild(newSelect, el);
        }
    });

    btn.disabled = true;
    btn.innerText = "⏳...";
    
    try {
        const response = await fetch('/api/scan_ips', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ gateway: gw })
        });
        
        if (response.ok) {
            const data = await response.json();
            ipFields.forEach(id => document.getElementById(id).innerHTML = '');

            if (data.free_ips && data.free_ips.length >= 2) {
                ipFields.forEach((id, index) => {
                    let el = document.getElementById(id);
                    el.innerHTML = '<option value="" disabled selected>Seleziona un IP...</option>';
                    data.free_ips.forEach(ip => {
                        el.innerHTML += `<option value="${ip}">${ip}</option>`;
                    });
                    if (data.free_ips[index]) el.value = data.free_ips[index];
                });
            } else {
                alert("Non sono stati trovati abbastanza IP liberi.");
            }
        }
    } catch (error) {
        alert("Impossibile eseguire la scansione della rete.");
    } finally {
        btn.innerText = "🔍 Trova IP";
        btn.disabled = false;
    }
}

function saveK3sConfig() {
    k3sConfigData = {
        gateway: document.getElementById('gateway').value.trim(),
        k3s_server_ip: document.getElementById('k3s_server_ip').value.trim(),
        k3s_agent_ip: document.getElementById('k3s_agent_ip').value.trim(),
        k3s_user: document.getElementById('k3s_user').value.trim(),
        k3s_password: document.getElementById('k3s_password').value.trim(),
        k3s_template_storage: document.getElementById('k3s_template_storage').value.trim(),
        k3s_disk_storage: document.getElementById('k3s_disk_storage').value.trim()
    };

    if (!k3sConfigData.k3s_server_ip || !k3sConfigData.k3s_agent_ip || !k3sConfigData.k3s_password || !k3sConfigData.k3s_template_storage) {
        alert("Compila tutti i campi obbligatori!");
        return;
    }

    const recapText = `🧠 K3s Server: ${k3sConfigData.k3s_server_ip}
💪 K3s Agent: ${k3sConfigData.k3s_agent_ip}
👤 Utente OS: ${k3sConfigData.k3s_user}
📦 Storage Template: ${k3sConfigData.k3s_template_storage}
💽 Storage Dischi: ${k3sConfigData.k3s_disk_storage}`;
    
    document.getElementById('recap-details').innerText = recapText;
    document.getElementById('recap-modal').classList.remove('hidden');
}

function chiudiRecap() { document.getElementById('recap-modal').classList.add('hidden'); }

async function confermaESalvaK3s() {
    const btn = document.getElementById('btn-conferma');
    btn.disabled = true;
    btn.innerText = "Salvataggio...";

    try {
        const response = await fetch('/api/k3s/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(k3sConfigData)
        });

        if (response.ok) {
            chiudiRecap();
            document.getElementById('config-card').classList.add('hidden');
            document.getElementById('setup-section').classList.remove('hidden');
        } else {
            const error = await response.json();
            alert("Errore: " + (error.message || "Sconosciuto"));
            btn.disabled = false;
            btn.innerText = "Conferma e Salva";
        }
    } catch (error) {
        alert("Impossibile connettersi al server.");
        btn.disabled = false;
        btn.innerText = "Conferma e Salva";
    }
}

async function runK3sSetup() {
    const btn = document.getElementById('btn-run');
    const consoleOutput = document.getElementById('console-output');
    
    consoleOutput.classList.remove('hidden');
    btn.disabled = true;
    btn.innerText = "⏳ Installazione in corso...";
    consoleOutput.innerText = "Avvio processi Ansible...\n\n";

    try {
        // FIX 1: Diciamo esplicitamente che stiamo parlando in JSON
        const response = await fetch('/api/k3s/setup', { 
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}) // Body vuoto ma valido
        });

        // Se l'errore è grave (es. 500) blocca tutto subito
        if (!response.ok && !response.body) {
            const errData = await response.json();
            throw new Error(errData.message || "Errore grave del server");
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder("utf-8");
        let buffer = "";

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop(); // Conserva l'ultima riga se incompleta
            
            for (const line of lines) {
                if (!line.trim()) continue;
                try {
                    const parsed = JSON.parse(line);
                    
                    // FIX 2: Se il backend sputa un errore che non è un log, mostralo!
                    if (parsed.success === false && parsed.message) {
                         consoleOutput.innerText += "\n❌ Errore dal Backend: " + parsed.message;
                         btn.innerText = "Errore";
                         btn.disabled = false;
                         return; // Ferma lo streaming
                    }

                    if (parsed.log) {
                        if (parsed.log.includes("PLAY [")) consoleOutput.innerText = "";
                        consoleOutput.innerText += parsed.log;
                        consoleOutput.scrollTop = consoleOutput.scrollHeight;
                    }
                    if (parsed.success === true) {
                        btn.innerText = "Completato ✔️";
                        btn.classList.replace('btn-primary', 'btn-secondary');
                        document.getElementById('btn-next').classList.remove('hidden');
                        document.getElementById('btn-next').disabled = false;
                    }
                } catch (e) {
                    // console.error("Ignoro riga non JSON:", line);
                }
            }
        }
    } catch (error) {
        consoleOutput.innerText += "\n\n❌ Errore: " + error.message;
        btn.innerText = "Errore";
        btn.disabled = false;
    }
}
