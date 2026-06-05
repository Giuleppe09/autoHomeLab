let nfsConfigData = null;

// --- NUOVE FUNZIONI PER IL FETCH DINAMICO DEGLI STORAGE ---
async function fetchStoragesNFS() {
    const btn = document.getElementById('btn-fetch-storages-nfs');
    const templateSelect = document.getElementById('nfs_template_storage');
    const diskSelect = document.getElementById('nfs_disk_storage');
    const hostMountSelect = document.getElementById('host_mount_path');

    btn.disabled = true;
    btn.innerText = "⏳ Scansione su PVE in corso...";

    try {
        const response = await fetch('/api/storages');
        const data = await response.json();

        if (response.ok) {
            populateSelect(templateSelect, data.template_storages, "local");
            populateSelect(diskSelect, data.disk_storages, "local-lvm");
            populateSelect(hostMountSelect, data.disk_storages, "local-lvm");
            
            btn.innerText = "✅ Storage Trovati";
            btn.style.backgroundColor = "#9ece6a";
            btn.style.color = "#1a1b26";
        } else {
            alert("Errore da Proxmox: " + (data.error || "Sconosciuto"));
            btn.innerText = "❌ Riprova";
        }
    } catch (error) {
        alert("Impossibile connettersi al server per eseguire lo script Ansible.");
        btn.innerText = "❌ Errore Rete";
    } finally {
        setTimeout(() => { 
            btn.disabled = false; 
            if(btn.innerText.includes("Riprova") || btn.innerText.includes("Errore")) {
                btn.innerText = "🔄 Cerca Storage su PVE";
            }
        }, 3000);
    }
}

function populateSelect(selectElement, optionsArray, defaultPreferred) {
    selectElement.innerHTML = '<option value="">Seleziona Storage...</option>';
    if (optionsArray && optionsArray.length > 0) {
        optionsArray.forEach(opt => {
            const option = document.createElement('option');
            option.value = opt;
            option.text = opt;
            if (opt === defaultPreferred) option.selected = true;
            selectElement.appendChild(option);
        });
    } else {
        selectElement.innerHTML = '<option value="">Nessun storage trovato</option>';
    }
}
// ------------------------------------------------------------


// Gestisce l'abilitazione visiva del tasto Cerca in base alla validità del Gateway inserito
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

// Scansiona la rete e trasforma l'input di testo in una vera <select> con gli IP utilizzabili
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
        nfs_network: document.getElementById('nfs_network').value.trim(),
        nfs_gw: document.getElementById('gateway').value.trim(),
        nfs_template_storage: document.getElementById('nfs_template_storage').value.trim(),
        nfs_disk_storage: document.getElementById('nfs_disk_storage').value.trim(),
        host_mount_path: document.getElementById('host_mount_path').value.trim(),
        lxc_mount_path: document.getElementById('lxc_mount_path').value.trim()
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
    const recapText = `🌐 IP Server NFS: ${nfsConfigData.nfs_ip}\n📡 Gateway Rete: ${nfsConfigData.nfs_gw}\n📦 Storage Template: ${nfsConfigData.nfs_template_storage}\n💽 Storage Disco Dati: ${nfsConfigData.nfs_disk_storage}\n💽 Target Proxmox: ${nfsConfigData.host_mount_path}\n🔒 Subnet LAN (K3s): ${nfsConfigData.nfs_network}`;

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
        const response = await fetch('/api/nfs/setup', { 
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({}) // Invia un payload vuoto ma valido per prevenire errori 415 in Flask
        });
        
        const reader = response.body.getReader();
        const decoder = new TextDecoder("utf-8");
        let buffer = "";
        
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop(); // Conserva frammenti incompleti nel buffer
            
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

// Inizializza lo stato del bottone di scansione al caricamento in base al valore iniziale del gateway
document.addEventListener("DOMContentLoaded", () => {
    enableNFSScan();
});