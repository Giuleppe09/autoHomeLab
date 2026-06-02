let k3sConfigData = null;

function enableK3sScan() {
    const gw = document.getElementById('gateway').value.trim();
    const btn = document.getElementById('btn-scan-k3s');
    if (gw.match(/^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/)) {
        btn.disabled = false;
    } else {
        btn.disabled = true;
    }
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
            ipFields.forEach(id => {
                let el = document.getElementById(id);
                el.innerHTML = '';
            });

            if (data.free_ips && data.free_ips.length >= 2) {
                ipFields.forEach((id, index) => {
                    let el = document.getElementById(id);
                    const defaultOption = document.createElement('option');
                    defaultOption.value = "";
                    defaultOption.text = "Seleziona un IP...";
                    defaultOption.disabled = true;
                    
                    el.appendChild(defaultOption);

                    data.free_ips.forEach(ip => {
                        const option = document.createElement('option');
                        option.value = ip; 
                        option.text = ip;  
                        el.appendChild(option);
                    });
                    
                    // Auto-assegna gli ip in modo crescente .200, .201, .202
                    if (data.free_ips[index]) {
                        el.value = data.free_ips[index];
                    }
                });
            } else {
                alert("Non sono stati trovati abbastanza IP liberi nel range.");
            }
        } else {
            alert("Errore dal server durante la scansione.");
        }
    } catch (error) {
        console.error("Errore durante la scansione:", error);
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
        k3s_password: document.getElementById('k3s_password').value.trim()
    };

    if (!k3sConfigData.k3s_server_ip || !k3sConfigData.k3s_agent_ip || !k3sConfigData.k3s_password) {
        alert("Compila tutti i campi obbligatori!");
        return;
    }

    const recapText = `📡 Gateway: ${k3sConfigData.gateway}
🧠 IP K3s Server: ${k3sConfigData.k3s_server_ip}
💪 IP K3s Agent: ${k3sConfigData.k3s_agent_ip}
👤 Utente Nodi: ${k3sConfigData.k3s_user}`;
    
    document.getElementById('recap-details').innerText = recapText;
    document.getElementById('recap-modal').classList.remove('hidden');
}

function chiudiRecap() {
    document.getElementById('recap-modal').classList.add('hidden');
}

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
            document.getElementById('config-section').classList.add('hidden');
            document.getElementById('setup-section').classList.remove('hidden');
        } else {
            const error = await response.json();
            alert("Errore dal server: " + (error.message || "Errore sconosciuto"));
            btn.disabled = false;
            btn.innerText = "Conferma e Salva";
        }
    } catch (error) {
        console.error("Errore di rete:", error);
        alert("Impossibile connettersi al server per salvare la configurazione K3s.");
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
        const response = await fetch('/api/k3s/setup', {
            method: 'POST'
        });

        if (!response.body) {
            throw new Error("Il server non supporta lo streaming");
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder("utf-8");

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            const chunk = decoder.decode(value, { stream: true });
            consoleOutput.innerText += chunk;
            
            // Auto-scroll verso il basso
            consoleOutput.scrollTop = consoleOutput.scrollHeight;
        }

        consoleOutput.innerText += "\n✅ Processo completato.";
        btn.innerText = "Completato";
        document.getElementById('btn-next').style.display = 'inline-block';
        document.getElementById('btn-next').disabled = false;

    } catch (error) {
        consoleOutput.innerText += "\n\n❌ Errore di rete: " + error.message;
        btn.innerText = "Errore";
    }
}