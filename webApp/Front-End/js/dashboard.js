let currentState = {};
let currentTargetService = ''; // Variabile globale per ricordare quale servizio stiamo gestendo nel modale

document.addEventListener('DOMContentLoaded', loadDashboardData);

// --- CARICAMENTO DATI DASHBOARD ---
async function loadDashboardData() {
    try {
        const response = await fetch('/api/infrastructure/state');
        const data = await response.json();
        
        if (data.success && data.state) {
            currentState = data.state;
            
            // Popola Proxmox
            document.getElementById('dash-pve-ip').innerText = currentState.proxmox_api_host || '-';
            document.getElementById('dash-pve-user').innerText = currentState.proxmox_api_user || '-';
            
            // Popola Tailscale
            document.getElementById('dash-ts-ip').innerText = currentState.lxc_ip || '-';
            document.getElementById('dash-ts-vmid').innerText = currentState.lxc_vmid || '-';
            
            // Popola NFS
            document.getElementById('dash-nfs-ip').innerText = currentState.nfs_ip || '-';
            document.getElementById('dash-nfs-mount').innerText = currentState.host_mount_path || '-';
            
            // Popola Nextcloud e Link
            document.getElementById('dash-nc-admin').innerText = currentState.nextcloud_admin_user || '-';
            
            // LOGICA MULTI-VOLUME: Unisce l'array dei dischi con un "+"
            let pvcDisplay = '-';
            if (currentState.nextcloud_storage_volumes && Array.isArray(currentState.nextcloud_storage_volumes) && currentState.nextcloud_storage_volumes.length > 0) {
                pvcDisplay = currentState.nextcloud_storage_volumes.join(' + ');
            } else if (currentState.nextcloud_storage_volumes && typeof currentState.nextcloud_storage_volumes === 'string') {
                pvcDisplay = currentState.nextcloud_storage_volumes;
            } else if (currentState.nextcloud_data_storage) {
                // Fallback nel caso in cui la variabile vecchia sia ancora presente
                pvcDisplay = currentState.nextcloud_data_storage;
            }
            
            // Rimpiazza 'Gi' con 'GB' per renderlo più bello esteticamente sulla dashboard
            const dashNcPvc = document.getElementById('dash-nc-pvc');
            if (dashNcPvc) dashNcPvc.innerText = pvcDisplay.replace(/Gi/g, ' GB');
            
            if (currentState.k3s_agent_ip) {
                const agentIp = currentState.k3s_agent_ip.split('/')[0];
                const ncUrl = `http://${agentIp}:30080`;
                const linkObj = document.getElementById('dash-nc-link');
                if(linkObj) {
                    linkObj.href = ncUrl;
                    // Mostriamo l'URL ma lo manteniamo esteticamente pulito
                    linkObj.innerText = `🔗 Apri Web UI Nextcloud ➡️`;
                }
            }
        }
    } catch (error) {
        console.error("Errore caricamento stato della Dashboard:", error);
    }
}

// --- LOGICA MODALE STORAGE INTERO CLUSTER ---
async function openStorageModal(serviceName) {
    currentTargetService = serviceName; // Salviamo il servizio su cui l'utente ha cliccato
    
    // Aggiorniamo il titolo del modale in modo dinamico
    const titleElement = document.getElementById('modal-storage-title');
    if (titleElement && serviceName) {
        const nomePulito = serviceName.charAt(0).toUpperCase() + serviceName.slice(1);
        titleElement.innerText = `⚙️ Gestione Storage ${nomePulito}`;
    }

    // Mostra il modale e la schermata di caricamento, nasconde i controlli
    document.getElementById('storage-modal').classList.remove('hidden');
    document.getElementById('storage-loading').style.display = 'block'; 
    document.getElementById('storage-controls').style.display = 'none';  

    // Resetta la console dei log se esiste
    const resizeConsole = document.getElementById('resize-console');
    if (resizeConsole) {
        resizeConsole.classList.add('hidden');
        resizeConsole.innerText = "";
    }
    
    // Resetta l'input dei GB
    const sizeInput = document.getElementById('new_pvc_size');
    if (sizeInput) sizeInput.value = ""; 
    
    try {
        // Fetch dei dati globali aggiornati
        const response = await fetch('/api/services/storage_accounting');
        const data = await response.json();
        
        if (response.ok && data.success) {
            document.getElementById('modal-current-pvc').innerText = data.global_allocated_gb + " GB";
            document.getElementById('modal-free-space').innerText = data.safe_free;
            
            // Renderizza il dettaglio dei servizi
            const breakdownContainer = document.getElementById('services-breakdown-list');
            if (breakdownContainer) {
                breakdownContainer.innerHTML = ""; // Svuota vecchi dati
                
                if (data.services_breakdown && Object.keys(data.services_breakdown).length > 0) {
                    for (const [srvName, gbAllocated] of Object.entries(data.services_breakdown)) {
                        const div = document.createElement('div');
                        div.style.marginBottom = "8px";
                        const nPulito = srvName.charAt(0).toUpperCase() + srvName.slice(1);
                        div.innerHTML = `<strong style="color: #9ece6a;">${nPulito}:</strong> ${gbAllocated} GB`;
                        breakdownContainer.appendChild(div);
                    }
                } else {
                    breakdownContainer.innerHTML = "<em style='color: #a9b1d6;'>Nessun servizio allocato al momento.</em>";
                }
            }

            // Imposta il limite massimo all'input in base allo spazio sicuro
            if (sizeInput) {
                sizeInput.max = data.safe_free;
            }
        } else {
            throw new Error(data.message || "Risposta non valida dal server");
        }
    } catch (e) {
        console.error("Errore lettura accounting storage:", e);
        document.getElementById('modal-current-pvc').innerText = "Errore";
        document.getElementById('modal-free-space').innerText = "Errore API";
    } finally {
        // Togli il caricamento e mostra i controlli finali
        document.getElementById('storage-loading').style.display = 'none';   
        document.getElementById('storage-controls').style.display = 'block'; 
    }
}

function closeStorageModal() {
    document.getElementById('storage-modal').classList.add('hidden');
}

// --- FUNZIONE DI ESPANSIONE STORAGE (STREAMING API) ---
async function expandStorage() {
    // Usiamo il servizio salvato dinamicamente al click sulla dashboard
    const selectedService = currentTargetService; 
    
    const newSize = document.getElementById('new_pvc_size').value;
    const maxFree = parseFloat(document.getElementById('new_pvc_size').max);
    
    // Validazioni
    if (!selectedService) {
        alert("Errore interno: Nessun servizio selezionato.");
        return;
    }
    if (!newSize || isNaN(newSize) || parseInt(newSize) <= 0) {
        alert("Inserisci un valore valido in GB per l'espansione.");
        return;
    }
    if (maxFree && parseInt(newSize) > maxFree) {
        alert(`Attenzione: Lo spazio richiesto supera lo spazio sicuro disponibile (${maxFree} GB).`);
        return;
    }

    const btn = document.getElementById('btn-expand');
    const consoleOut = document.getElementById('resize-console');
    
    // Stato di caricamento UI
    btn.disabled = true;
    btn.innerText = "⏳ Espansione in corso...";
    consoleOut.classList.remove('hidden');
    consoleOut.style.display = 'block';
    
    consoleOut.innerText = `Inizializzazione espansione per ${selectedService}...\n`;

    try {
        const response = await fetch(`/api/services/${selectedService}/expand_storage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ new_size: parseInt(newSize) }) 
        });

        const reader = response.body.getReader();
        const decoder = new TextDecoder("utf-8");
        let buffer = "";

        // Lettura dello stream in tempo reale
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop(); // Conserva frammenti incompleti
            
            for (const line of lines) {
                if (!line.trim()) continue;
                try {
                    const parsed = JSON.parse(line);
                    
                    if (parsed.log) {
                        consoleOut.innerText += parsed.log;
                        consoleOut.scrollTop = consoleOut.scrollHeight; // Autoscroll verso il basso
                    }
                    
                    if (parsed.success === true) {
                        btn.innerText = "✅ Completato!";
                        // Ricarica la modale per mostrare i nuovi valori globali
                        setTimeout(() => {
                            btn.disabled = false;
                            btn.innerText = "🚀 Applica Espansione";
                            openStorageModal(currentTargetService); 
                            loadDashboardData(); // Ricarica anche i dati dietro (es. la grid main)
                        }, 2500);
                    } else if (parsed.success === false) {
                        btn.disabled = false;
                        btn.innerText = "❌ Fallito (Riprova)";
                    }
                } catch (e) {
                    // Ignora le righe che non sono JSON valido
                }
            }
        }
    } catch (error) {
        consoleOut.innerText += "\n❌ Errore di rete: " + error.message;
        btn.disabled = false;
        btn.innerText = "Riprova";
    }
}