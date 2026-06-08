document.addEventListener('DOMContentLoaded', loadDashboard);
let availableStorages = [];

async function loadDashboard() {
    const grid = document.getElementById('dashboard-grid');
    try {
        const response = await fetch('/api/infrastructure/state');
        const data = await response.json();
        
        if (response.ok && data.state) {
            const state = data.state;
            grid.innerHTML = '';
            
            // 🖥️ Proxmox
            grid.innerHTML += `<div class="card">
                <h2>🖥️ Proxmox Node</h2>
                <p><strong>IP API:</strong> ${state.proxmox_api_host || 'N/D'}</p>
                <p><strong>Utente API:</strong> ${state.proxmox_api_user || 'N/D'}</p>
            </div>`;
            
            // 🌐 Tailscale
            if (state.lxc_ip) {
                grid.innerHTML += `<div class="card">
                    <h2>🌐 Gateway VPN (Tailscale)</h2>
                    <p><strong>IP LXC:</strong> ${state.lxc_ip}</p>
                    <p><strong>VMID:</strong> ${state.lxc_vmid}</p>
                </div>`;
            }
            
            // 🗄️ NFS
            if (state.nfs_ip) {
                grid.innerHTML += `<div class="card">
                    <h2>🗄️ NFS Storage Server</h2>
                    <p><strong>IP LXC:</strong> ${state.nfs_ip}</p>
                    <p><strong>Mount Principale:</strong> ${state.host_mount_path || 'N/D'}</p>
                </div>`;
            }
            
            // ☁️ Nextcloud
            if (state.nextcloud_user) {
                grid.innerHTML += `<div class="card">
                    <h2>☁️ Nextcloud (K3s)</h2>
                    <p><strong>Admin:</strong> ${state.nextcloud_user}</p>
                    <p><strong>PVC Primario:</strong> ${state.nextcloud_storage_size || 0} GB su ${state.nextcloud_disk_storage}</p>
                    <button class="btn" onclick="openStorageModal()">⚙️ Gestisci Storage</button>
                </div>`;
            }
        } else {
            grid.innerHTML = `<p style="color: #f7768e;">❌ Errore nel caricamento dello stato.</p>`;
        }
    } catch (e) {
        grid.innerHTML = `<p style="color: #f7768e;">❌ Impossibile connettersi al backend.</p>`;
    }
}

async function openStorageModal() {
    document.getElementById('storage-modal').style.display = 'flex';
    const select = document.getElementById('new_storage_select');
    const sliderContainer = document.getElementById('slider-container');
    const inputSize = document.getElementById('new_storage_size');
    const labelVal = document.getElementById('new-storage-val');
    const maxLabel = document.getElementById('new-range-max');
    
    try {
        // Richiamiamo la nostra robusta API degli storage su Proxmox!
        const res = await fetch('/api/storages');
        const data = await res.json();
        
        if (res.ok && data.disk_storages) {
            availableStorages = data.disk_storages;
            select.innerHTML = '';
            
            availableStorages.forEach(s => {
                select.innerHTML += `<option value="${s.name}">${s.name} (${s.free_gb} GB liberi su ${s.total_gb} GB)</option>`;
            });
            
            sliderContainer.style.display = 'block';
            
            const updateSlider = () => {
                const storage = availableStorages.find(s => s.name === select.value);
                if (storage) {
                    const max = Math.floor(storage.free_gb);
                    inputSize.max = max > 5 ? max : 5;
                    maxLabel.innerText = inputSize.max + "GB";
                    if (parseInt(inputSize.value) > inputSize.max) inputSize.value = inputSize.max;
                    labelVal.innerText = inputSize.value;
                }
            };
            
            select.onchange = updateSlider;
            inputSize.oninput = () => labelVal.innerText = inputSize.value;
            updateSlider();
        }
    } catch (e) {
        select.innerHTML = '<option value="">Errore API Storage</option>';
    }
}

function closeModal() { 
    document.getElementById('storage-modal').style.display = 'none'; 
}

function addNextcloudStorage() {
    const size = document.getElementById('new_storage_size').value;
    alert(`Questa azione lancerà un playbook Ansible che modificherà l'LXC NFS per aggiungere un mount da ${size}GB e genererà un nuovo PVC in K3s! (Funzionalità da implementare nel backend)`);
}