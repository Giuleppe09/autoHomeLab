// Esegui un controllo dello stato appena la pagina si è caricata
document.addEventListener('DOMContentLoaded', checkStatus);

async function checkStatus() {
    // Creazione dinamica del container wrapper in alto a destra
    let wrapper = document.getElementById('pve-status-wrapper');
    if (!wrapper) {
        wrapper = document.createElement('div');
        wrapper.id = 'pve-status-wrapper';
        wrapper.style.cssText = "position: absolute; top: 20px; right: 20px; display: flex; flex-direction: column; align-items: flex-end; gap: 8px; z-index: 1000;";
        document.body.appendChild(wrapper);

        let initialStatusContainer = document.createElement('div');
        initialStatusContainer.id = 'pve-status-dot';
        initialStatusContainer.style.cssText = "display: flex; align-items: center; gap: 8px; font-weight: bold; font-size: 14px; background: #1f2335; padding: 8px 12px; border-radius: 20px; border: 1px solid #414868; color: #a9b1d6; cursor: pointer; transition: opacity 0.2s;";
        initialStatusContainer.title = "Clicca per aggiornare lo stato";
        initialStatusContainer.onclick = checkStatus;
        initialStatusContainer.onmouseover = () => initialStatusContainer.style.opacity = "0.8";
        initialStatusContainer.onmouseout = () => initialStatusContainer.style.opacity = "1";
        wrapper.appendChild(initialStatusContainer);
    }
    
    let statusContainer = document.getElementById('pve-status-dot');

    // Animazione di caricamento (giallo/arancione)
    statusContainer.innerHTML = '<span style="display:inline-block; width:14px; height:14px; border-radius:50%; background-color: #e0af68; box-shadow: 0 0 8px #e0af68;"></span> Verifica Proxmox...';
    statusContainer.style.pointerEvents = "none";
    statusContainer.style.opacity = "0.5";
    
    try {
        const response = await fetch('/api/check_status');
        if (response.ok) {
            const data = await response.json();
            if (data.status === "online") {
                statusContainer.innerHTML = '<span style="display:inline-block; width:14px; height:14px; border-radius:50%; background-color: #9ece6a; box-shadow: 0 0 8px #9ece6a;"></span> Proxmox Online';
            } else {
                statusContainer.innerHTML = '<span style="display:inline-block; width:14px; height:14px; border-radius:50%; background-color: #f7768e; box-shadow: 0 0 8px #f7768e;"></span> Proxmox Offline';
            }
        } else {
            statusContainer.innerHTML = '<span style="display:inline-block; width:14px; height:14px; border-radius:50%; background-color: #f7768e; box-shadow: 0 0 8px #f7768e;"></span> Errore di stato';
        }
    } catch (error) {
        console.error("Errore durante il fetch dello stato:", error);
        statusContainer.innerHTML = '<span style="display:inline-block; width:14px; height:14px; border-radius:50%; background-color: #f7768e; box-shadow: 0 0 8px #f7768e;"></span> Rete non raggiungibile';
    } finally {
        statusContainer.style.pointerEvents = "auto";
        statusContainer.style.opacity = "1";
    }
}

async function runTailscaleSetup() {
    const consoleOutput = document.getElementById('console-output');
    const setupBtn = document.getElementById('setup-btn');
    
    // Mostra la console e disabilita il bottone per evitare doppi click
    consoleOutput.classList.remove('hidden');
    consoleOutput.innerText = "Avvio del processo Ansible in corso. Attendere prego...\n";
    setupBtn.disabled = true;

    try {
        // Lancia l'endpoint per l'esecuzione dei playbook
        const response = await fetch('/api/tailscale/setup', { method: 'POST' });

        if (!response.ok) {
            throw new Error(await response.text());
        }
        
        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let buffer = "";
        
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            
            // L'ultimo frammento è una riga incompleta (non ancora terminata con \n)
            buffer = lines.pop();
            
            for (const line of lines) {
                if (!line.trim()) continue;
                
                try {
                    const parsed = JSON.parse(line);
                    
                    if (parsed.log) {
                        if (parsed.log.includes("PLAY [")) {
                            consoleOutput.innerText = "";
                        }
                        consoleOutput.innerText += parsed.log;
                        consoleOutput.scrollTop = consoleOutput.scrollHeight; // Autoscroll
                    }

                    // Apparizione condizionata dal flag booleano restituito dal back-end
                    if (parsed.success === true) {
                        setupBtn.innerHTML = 'Passa al prossimo step (NFS) &rarr;';
                        setupBtn.style.backgroundColor = '#9ece6a';
                        setupBtn.style.color = '#1a1b26';
                        setupBtn.onclick = () => window.location.href = '/nfs';
                    }
                } catch (e) {
                    console.error("Errore nel parsing del log (JSON):", e, line);
                }
            }
        }
    } catch (error) {
        console.error("Errore di rete:", error);
        consoleOutput.innerText += "\n❌ Errore di connessione: il server non risponde o ha chiuso la connessione inaspettatamente.";
    } finally {
        setupBtn.disabled = false;
    }
}