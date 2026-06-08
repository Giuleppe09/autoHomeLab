let configData = null;

// --- FUNZIONI PER IL FETCH DINAMICO DEGLI STORAGE ---
async function fetchStoragesConfig() {
    const btn = document.getElementById('btn-fetch-storages-config');
    const templateSelect = document.getElementById('lxc_template_storage');
    const diskSelect = document.getElementById('lxc_disk_storage');

    btn.disabled = true;
    btn.innerText = "⏳ Lettura in corso...";

    try {
        const response = await fetch('/api/storages');
        const data = await response.json();

        if (response.ok) {
            populateSelect(templateSelect, data.template_storages, "local");
            populateSelect(diskSelect, data.disk_storages, "local-lvm");
            
            btn.innerText = "✅ Storage Trovati";
            btn.style.backgroundColor = "#9ece6a";
            btn.style.color = "#1a1b26";
        } else {
            alert("Errore da Proxmox: " + (data.error || "Sconosciuto"));
            btn.innerText = "❌ Riprova";
        }
    } catch (error) {
        alert("Impossibile connettersi al server per leggere i dati.");
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
            option.value = opt.name;
            option.text = `${opt.name} (${opt.free_gb} GB liberi su ${opt.total_gb} GB)`;
            if (opt.name === defaultPreferred) option.selected = true;
            selectElement.appendChild(option);
        });
    } else {
        selectElement.innerHTML = '<option value="">Nessun storage trovato</option>';
    }
}
// ------------------------------------------------------------


function enableScan() {
    const gw = document.getElementById('lxc_gw').value.trim();
    const btn = document.getElementById('btn-scan');
    // Abilita il bottone solo se il testo inserito assomiglia a un IPv4 valido
    if (gw.match(/^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/)) {
        btn.disabled = false;
    } else {
        btn.disabled = true;
    }
}

async function scanFreeIPs() {
    const gw = document.getElementById('lxc_gw').value.trim();
    const btn = document.getElementById('btn-scan');
    let lxcIpElement = document.getElementById('lxc_ip');

    // Se lxc_ip è ancora un input di testo, lo trasformiamo in <select> (come fatto in NFS)
    if (lxcIpElement && lxcIpElement.tagName.toLowerCase() === 'input') {
        const newSelect = document.createElement('select');
        newSelect.id = lxcIpElement.id;
        newSelect.className = lxcIpElement.className;
        newSelect.style.flex = '1';
        newSelect.required = true;
        lxcIpElement.parentNode.replaceChild(newSelect, lxcIpElement);
        lxcIpElement = newSelect;
    }

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
            lxcIpElement.innerHTML = ''; // Svuota opzioni precedenti

            if (data.free_ips && data.free_ips.length > 0) {
                const defaultOption = document.createElement('option');
                defaultOption.value = "";
                defaultOption.text = "Seleziona un IP libero dalla lista...";
                defaultOption.disabled = true;
                defaultOption.selected = true;
                lxcIpElement.appendChild(defaultOption);

                data.free_ips.forEach(ip => {
                    const option = document.createElement('option');
                    option.value = ip + '/24'; 
                    option.text = ip + '/24';  
                    lxcIpElement.appendChild(option);
                });
                lxcIpElement.focus();
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

function saveConfig() {
    configData = {
        lxc_template_storage: document.getElementById('lxc_template_storage').value.trim(),
        lxc_disk_storage: document.getElementById('lxc_disk_storage').value.trim(),
        lxc_gw: document.getElementById('lxc_gw').value.trim(),
        lxc_ip: document.getElementById('lxc_ip').value.trim(),
        ts_auth: document.getElementById('ts_auth').value.trim(),
        ts_api: document.getElementById('ts_api').value.trim(),
        local_sudo_pass: document.getElementById('local_sudo_pass').value.trim()
    };

    if (!configData.lxc_template_storage || !configData.lxc_disk_storage) {
        alert("Seleziona gli storage su Proxmox dai relativi menu a tendina. Premi 'Cerca Storage su PVE' per aggiornarli.");
        return;
    }

    // Validazione formattazione CIDR dell'IP
    const ipCidrRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\/([1-9]|[1-2][0-9]|3[0-2])$/;
    if (!ipCidrRegex.test(configData.lxc_ip)) {
        alert("Il formato dell'IP non è valido. Seleziona un IP dal tool di scansione (es. 192.168.1.16/24).");
        return;
    }

    // Costruzione stringa di Recap
    const recapText = `📦 Storage Template OS: ${configData.lxc_template_storage}
💽 Storage Disco LXC: ${configData.lxc_disk_storage}
📡 Gateway Rete: ${configData.lxc_gw}
🌐 IP Statico Gateway LXC: ${configData.lxc_ip}
🔑 Auth Key Tailscale: ${configData.ts_auth.substring(0, 12)}...
🔑 API Key Tailscale: ${configData.ts_api.substring(0, 12)}...`;

    document.getElementById('recap-details').innerText = recapText;
    document.getElementById('recap-modal').classList.remove('hidden');
}

function chiudiRecap() {
    document.getElementById('recap-modal').classList.add('hidden');
}

async function confermaESalva() {
    const btn = document.getElementById('btn-conferma');
    btn.disabled = true;
    btn.innerText = "Salvataggio...";
    
    try {
        const response = await fetch('/api/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(configData)
        });
        
        if (response.ok) {
            chiudiRecap();
            // Reindirizza al processo successivo (Setup Tailscale)
            window.location.href = '/tailscale'; 
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

// Inizializza lo stato del bottone di scansione al caricamento in base al valore iniziale
document.addEventListener("DOMContentLoaded", () => {
    enableScan();
});