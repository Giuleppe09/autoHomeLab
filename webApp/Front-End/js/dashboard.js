let currentState = {};

document.addEventListener('DOMContentLoaded', loadDashboardData);

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
            document.getElementById('dash-nc-pvc').innerText = pvcDisplay.replace(/Gi/g, ' GB');
            
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

// --- LOGICA MODALE STORAGE ---
async function openStorageModal() {
    document.getElementById('storage-modal').classList.remove('hidden');
    document.getElementById('storage-loading').classList.remove('hidden');
    document.getElementById('storage-controls').classList.add('hidden');
    document.getElementById('resize-console').classList.add('hidden');
    document.getElementById('resize-console').innerText = "";
    document.getElementById('new_pvc_size').value = ""; // Resetta l'input per il nuovo disco
    
    // Mostra i volumi attuali uniti col +
    let currentVolumes = ["50Gi"];
    if (currentState.nextcloud_storage_volumes && Array.isArray(currentState.nextcloud_storage_volumes)) {
        currentVolumes = currentState.nextcloud_storage_volumes;
    } else if (currentState.nextcloud_data_storage) {
        currentVolumes = [currentState.nextcloud_data_storage];
    }
    document.getElementById('modal-current-pvc').innerText = currentVolumes.join(' + ').replace(/Gi/g, ' GB');

    // Richiede gli storage aggiornati a Proxmox
    try {
        const response = await fetch('/api/storages');
        const data = await response.json();
        
        if (response.ok && data.disk_storages) {
            // Cerca lo storage che stiamo effettivamente usando per NFS (host_mount_path)
            const nfsPoolName = currentState.host_mount_path || "local-lvm";
            const targetStorage = data.disk_storages.find(s => s.name === nfsPoolName) || data.disk_storages[0];
            
            if (targetStorage) {
                document.getElementById('modal-pool-name').innerText = targetStorage.name;
                document.getElementById('modal-free-space').innerText = targetStorage.free_gb;
                // Imposta il massimo espandibile
                document.getElementById('new_pvc_size').max = targetStorage.free_gb;
            }
        }
    } catch (e) {
        console.error("Errore lettura dischi da Proxmox", e);
        document.getElementById('modal-free-space').innerText = "Errore API";
    } finally {
        document.getElementById('storage-loading').classList.add('hidden');
        document.getElementById('storage-controls').classList.remove('hidden');
    }
}

function closeStorageModal() {
    document.getElementById('storage-modal').classList.add('hidden');
}

async function expandStorage() {
    const newSize = document.getElementById('new_pvc_size').value;
    const maxFree = parseFloat(document.getElementById('new_pvc_size').max);
    
    // Validazioni
    if (!newSize || isNaN(newSize) || parseInt(newSize) <= 0) {
        alert("Inserisci un valore valido in GB per il nuovo disco.");
        return;
    }

    if (maxFree && parseInt(newSize) > maxFree) {
        alert(`Attenzione: Lo spazio richiesto (${newSize} GB) supera lo spazio fisico libero sul disco Proxmox (${maxFree} GB).`);
        return;
    }

    const btn = document.getElementById('btn-expand');
    const consoleOut = document.getElementById('resize-console');
    
    btn.disabled = true;
    btn.innerText = "⏳ Aggiunta in corso...";
    consoleOut.classList.remove('hidden');
    consoleOut.innerText = "Avvio deployment Ansible per il nuovo Volume...\n\n";

    try {
        const response = await fetch('/api/services/nextcloud/expand_storage', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ new_size: newSize }) // Inviamo solo il numero, es: "20"
        });

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
                    
                    if (parsed.log) {
                        consoleOut.innerText += parsed.log;
                        consoleOut.scrollTop = consoleOut.scrollHeight; // Autoscroll verso il basso
                    }
                    
                    if (parsed.success === true) {
                        btn.innerText = "✅ Volume Aggiunto";
                        
                        // Dopo 2 secondi chiude il modale e ricarica i dati dietro le quinte
                        setTimeout(() => {
                            closeStorageModal();
                            loadDashboardData(); 
                            btn.disabled = false;
                            btn.innerText = "Applica Espansione";
                        }, 2000);
                    } else if (parsed.success === false) {
                        throw new Error("Errore durante l'esecuzione del Playbook Ansible.");
                    }
                } catch (e) {
                    // Ignoriamo gli errori di parsing JSON durante lo stream
                }
            }
        }
    } catch (error) {
        consoleOut.innerText += "\n❌ Errore durante l'aggiunta: " + error.message;
        btn.disabled = false;
        btn.innerText = "Riprova Aggiunta Volume";
    }
}