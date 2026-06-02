let nfsConfigData = null;

function enableNFSScan() {
    const gw = document.getElementById('gateway').value.trim();
    const btn = document.getElementById('btn-scan-nfs');
    // Abilita il bottone solo se il testo inserito assomiglia a un IPv4 valido
    if (gw.match(/^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/)) {
        btn.disabled = false;
    } else {
        btn.disabled = true;
    }
}

async function scanFreeIPsNFS() {
    const gw = document.getElementById('gateway').value.trim();
    const btn = document.getElementById('btn-scan-nfs');
    let nfsIpSelect = document.getElementById('nfs_ip');
    
    // Se nfs_ip è ancora un input di testo, lo trasformiamo al volo in una <select> coerente
    if (nfsIpSelect && nfsIpSelect.tagName.toLowerCase() === 'input') {
        const newSelect = document.createElement('select');
        newSelect.id = nfsIpSelect.id;
        newSelect.className = nfsIpSelect.className;
        nfsIpSelect.parentNode.replaceChild(newSelect, nfsIpSelect);
        nfsIpSelect = newSelect;
    }

    btn.disabled = true;
    btn.innerText = "⏳...";
    
    try {
        const response = await fetch('/api/scan_ips', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ gateway: gw }) // Passa il gateway reale inserito dall'utente
        });
        
        if (response.ok) {
            const data = await response.json();
            nfsIpSelect.innerHTML = ''; // Svuota opzioni precedenti

            if (data.free_ips && data.free_ips.length > 0) {
                const defaultOption = document.createElement('option');
                defaultOption.value = "";
                defaultOption.text = "Seleziona un IP libero per l'NFS...";
                defaultOption.disabled = true;
                defaultOption.selected = true;
                nfsIpSelect.appendChild(defaultOption);
                
                data.free_ips.forEach(ip => {
                    const option = document.createElement('option');
                    option.value = ip + '/24'; // Fornisce il CIDR richiesto da Proxmox
                    option.text = ip + '/24';  
                    nfsIpSelect.appendChild(option);
                });
            } else {
                alert("Non sono stati trovati IP liberi nel range standard.");
            }
        } else {
            alert("Errore del server durante la scansione.");
        }
    } catch (error) {
        console.error("Errore scansione:", error);
        alert("Impossibile eseguire la scansione della rete.");
    } finally {
        btn.innerText = "🔍 Trova IP";
        btn.disabled = false;
    }
}

function saveNFSConfig() {
    nfsConfigData = {
        nfs_ip: document.getElementById('nfs_ip').value.trim(),
        nfs_template_storage: document.getElementById('nfs_template_storage').value.trim(),
        nfs_disk_storage: document.getElementById('nfs_disk_storage').value.trim(),
        host_mount_path: document.getElementById('host_mount_path').value.trim(),
        nfs_network: document.getElementById('nfs_network').value.trim(),
        nfs_gw: document.getElementById('gateway').value.trim()
    };

    // Validazione robusta (Stile Tailscale Config)
    if (!nfsConfigData.nfs_ip || !nfsConfigData.nfs_template_storage || !nfsConfigData.nfs_disk_storage || !nfsConfigData.host_mount_path || !nfsConfigData.nfs_network || !nfsConfigData.nfs_gw) {
        alert("Per favore, compila tutti i campi prima di procedere.");
        return;
    }

    // Validazione formattazione CIDR dell'IP scelto
    const ipCidrRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\/([1-9]|[1-2][0-9]|3[0-2])$/;
    if (!ipCidrRegex.test(nfsConfigData.nfs_ip)) {
        alert("Il formato dell'IP non è valido. Seleziona un IP dal tool di scansione (es. 192.168.1.200/24).");
        return;
    }

    // Costruzione del testo per il Modale di Conferma
    const recapText = `🌐 IP Server NFS: ${nfsConfigData.nfs_ip}
📡 Gateway Rete: ${nfsConfigData.nfs_gw}
📦 Storage Template: ${nfsConfigData.nfs_template_storage}
💽 Storage Disco Dati: ${nfsConfigData.nfs_disk_storage}
💽 Target Proxmox: ${nfsConfigData.host_mount_path}
🔒 Subnet LAN (K3s): ${nfsConfigData.nfs_network}`;

    document.getElementById('recap-details').innerText = recapText;
    document.getElementById('recap-modal').classList.remove('hidden');
}

function chiudiRecap() { 
    document.getElementById('recap-modal').classList.add('hidden'); 
}

async function confermaESalvaNFS() {
    const btn = document.getElementById('btn-conferma');
    btn.disabled = true; 
    btn.innerText = "Salvataggio...";
    try {
        const response = await fetch('/api/nfs/config', { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify(nfsConfigData) 
        });
        if (response.ok) {
            chiudiRecap();
            document.getElementById('config-section').classList.add('hidden');
            document.getElementById('setup-section').classList.remove('hidden');
        } else {
            alert("Errore lato server durante il salvataggio dei parametri.");
            btn.disabled = false;
            btn.innerText = "Conferma e Salva";
        }
    } catch (error) { 
        alert("Errore di rete."); 
        btn.disabled = false; 
        btn.innerText = "Conferma e Salva"; 
    }
}
async function runNFSSetup() {
    const btn = document.getElementById('btn-run');
    const consoleOutput = document.getElementById('console-output');
    
    consoleOutput.classList.remove('hidden');
    btn.disabled = true; 
    btn.innerText = "⏳ Installazione in corso...";
    consoleOutput.innerText = "Avvio processi Ansible...\n\n";
    
    try {
        // Correggiamo la fetch inviando un body JSON vuoto e l'header corretto
        const response = await fetch('/api/nfs/setup', { 
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({}) // Invia un payload vuoto ma valido
        });
        
        const reader = response.body.getReader();
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
                    
                    if (parsed.log) {
                        if (parsed.log.includes("PLAY [")) {
                            consoleOutput.innerText = "";
                        }
                        consoleOutput.innerText += parsed.log;
                        consoleOutput.scrollTop = consoleOutput.scrollHeight;
                    }

                    if (parsed.success === true) {
                        btn.innerText = "Completato ✔️";
                        btn.classList.remove('btn-primary');
                        btn.classList.add('btn-secondary');
                        
                        const btnNext = document.getElementById('btn-next');
                        if (btnNext) {
                            btnNext.classList.remove('hidden');
                            btnNext.disabled = false;
                        }
                    }
                } catch (e) {
                    console.error("Errore nel parsing del log (JSON):", e, line);
                }
            }
        }
    } catch (error) { 
        consoleOutput.innerText += "\n❌ Errore di rete durante lo streaming dei log."; 
        btn.innerText = "Errore di Rete"; 
        btn.disabled = false;
    }
}