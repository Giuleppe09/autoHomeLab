let nfsConfigData = null;

// Gestisce l'abilitazione visiva del tasto Cerca in base alla validità del Gateway inserito
function enableNFSScan() {
    const gw = document.getElementById('gateway').value.trim();
    const btn = document.getElementById('btn-scan-nfs');
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
    let nfsIpElement = document.getElementById('nfs_ip');

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

            if (data.free_ips && data.free_ips.length > 0) {
                
                // Se l'elemento è ancora un input text, lo convertiamo in una <select>
                if (nfsIpElement.tagName.toLowerCase() === 'input') {
                    const newSelect = document.createElement('select');
                    newSelect.id = nfsIpElement.id;
                    newSelect.className = nfsIpElement.className; // Mantiene la classe 'form-control'
                    newSelect.style.flex = '1';
                    newSelect.required = true;
                    nfsIpElement.parentNode.replaceChild(newSelect, nfsIpElement);
                    nfsIpElement = newSelect; // Aggiorna il riferimento all'elemento nel DOM
                }

                // Svuota opzioni preesistenti
                nfsIpElement.innerHTML = ''; 

                // Aggiunge l'opzione vuota di default
                const defaultOption = document.createElement('option');
                defaultOption.value = "";
                defaultOption.text = "Seleziona un IP libero dalla lista...";
                defaultOption.disabled = true;
                defaultOption.selected = true;
                nfsIpElement.appendChild(defaultOption);

                // Popola la select con tutti gli IP liberi restituiti dal backend
                data.free_ips.forEach(ip => {
                    const option = document.createElement('option');
                    option.value = ip + '/24'; // Fornisce la notazione CIDR richiesta da Proxmox
                    option.text = ip + '/24';
                    nfsIpElement.appendChild(option);
                });

                // Sposta l'attenzione dell'utente sul menu appena generato
                nfsIpElement.focus();
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
        btn.innerText = "🔍 Cerca";
        btn.disabled = false;
    }
}

// Raccoglie i dati compilati dal form e mostra il modale di riepilogo
function saveNFSConfig() {
    nfsConfigData = {
        nfs_ip: document.getElementById('nfs_ip').value.trim(),
        nfs_network: document.getElementById('nfs_network').value.trim(),
        nfs_gw: document.getElementById('gateway').value.trim(),
        nfs_template_storage: document.getElementById('nfs_template_storage').value.trim(),
        host_mount_path: document.getElementById('host_mount_path').value.trim(),
        lxc_mount_path: document.getElementById('lxc_mount_path').value.trim()
    };

    // Validazione robusta dei formati di rete prima dell'invio (REGEX CORRETTA!)
    const ipCidrRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\/([1-9]|[1-2][0-9]|3[0-2])$/;
    
    if (!ipCidrRegex.test(nfsConfigData.nfs_ip) || !ipCidrRegex.test(nfsConfigData.nfs_network)) {
        alert("Il formato dell'IP o della Subnet non è valido. Assicurati di includere la maschera (es. /24).");
        return;
    }

    if (!nfsConfigData.nfs_template_storage || !nfsConfigData.host_mount_path) {
        alert("Seleziona gli storage su Proxmox dai relativi menu a tendina.");
        return;
    }

    // Compila la stringa testuale del box di riepilogo
    const recapText = `📡 Gateway Rete: ${nfsConfigData.nfs_gw}\n🔒 Subnet K3s (NFS): ${nfsConfigData.nfs_network}\n🌐 IP Statico LXC NFS: ${nfsConfigData.nfs_ip}\n📦 Storage Template OS: ${nfsConfigData.nfs_template_storage}\n💽 Target Storage Proxmox: ${nfsConfigData.host_mount_path}\n📁 Mount Point Interno LXC: ${nfsConfigData.lxc_mount_path}`;

    document.getElementById('recap-details').innerText = recapText;
    document.getElementById('recap-modal').classList.remove('hidden');
}

// Nasconde il modale di riepilogo
function chiudiRecap() { 
    document.getElementById('recap-modal').classList.add('hidden'); 
}

// Invia la configurazione definitiva al backend ed effettua lo switch delle sezioni grafiche
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

// Lancia l'esecuzione del Playbook Ansible e streamma i log in tempo reale sulla console video
async function runNFSSetup() {
    const btn = document.getElementById('btn-run');
    const consoleOutput = document.getElementById('console-output');
    
    consoleOutput.classList.remove('hidden');
    btn.disabled = true; 
    btn.innerText = "⏳ Installazione in corso...";
    consoleOutput.innerText = "Avvio processi Ansible...\n\n";
    
    try {
        const response = await fetch('/api/nfs/setup', { method: 'POST' });
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
                            consoleOutput.innerText = ""; // Svuota la stringa di caricamento iniziale
                        }
                        consoleOutput.innerText += parsed.log;
                        consoleOutput.scrollTop = consoleOutput.scrollHeight; // Auto-scroll verso il basso
                    }

                    if (parsed.success === true) {
                        btn.innerText = "Completato ✔️";
                        btn.classList.remove('btn-primary');
                        btn.classList.add('btn-secondary');
                        
                        const btnNext = document.getElementById('btn-next');
                        btnNext.classList.remove('hidden');
                        btnNext.disabled = false;
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