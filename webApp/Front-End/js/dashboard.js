let currentState = {};
let currentTargetService = '';

document.addEventListener('DOMContentLoaded', loadDashboardData);

// --- CARICAMENTO DATI DASHBOARD ---
async function loadDashboardData() {
    try {
        const response = await fetch('/api/infrastructure/state');
        const data = await response.json();

        if (data.success && data.state) {
            currentState = data.state;

            const setSafeText = (id, text) => {
                const el = document.getElementById(id);
                if (el) el.innerText = text;
            };

            setSafeText('dash-pve-ip',    currentState.proxmox_api_host || '—');
            setSafeText('dash-pve-user',  currentState.proxmox_api_user || '—');
            setSafeText('dash-ts-ip',     currentState.lxc_ip           || '—');
            setSafeText('dash-ts-vmid',   currentState.lxc_vmid         || '—');
            setSafeText('dash-nfs-ip',    currentState.nfs_ip           || '—');
            setSafeText('dash-nfs-mount', currentState.host_mount_path  || '—');
            setSafeText('dash-nc-admin',  currentState.nextcloud_user || currentState.nextcloud_admin_user || '—');

            const agentIpRaw = currentState.k3s_agent_ip || currentState.k3s_server_ip || currentState.lxc_ip || '127.0.0.1';
            const agentIp    = agentIpRaw.split('/')[0];
            const ncUrl      = `http://${agentIp}:30080`;
            const linkEl     = document.getElementById('dash-nc-link');
            if (linkEl) {
                linkEl.href  = ncUrl;
                linkEl.title = ncUrl;
            }
        }
    } catch (error) {
        console.error('Errore caricamento stato dashboard:', error);
    }
}

// --- APERTURA MODALE STORAGE ---
async function openStorageModal(serviceName) {
    currentTargetService = serviceName;

    const nomePulito = serviceName.charAt(0).toUpperCase() + serviceName.slice(1);
    const titleEl = document.getElementById('modal-storage-title');
    if (titleEl) titleEl.innerText = `Gestione Storage ${nomePulito}`;

    // Mostra overlay e stato di caricamento
    document.getElementById('storage-modal').classList.add('show');
    document.getElementById('storage-loading').style.display = 'flex';
    document.getElementById('storage-controls').style.display = 'none';

    // Reset console e input
    const consoleEl = document.getElementById('resize-console');
    if (consoleEl) { consoleEl.style.display = 'none'; consoleEl.innerText = ''; }
    const sizeInput = document.getElementById('new_pvc_size');
    if (sizeInput) sizeInput.value = '';

    try {
        const response = await fetch('/api/services/storage_accounting');
        const data     = await response.json();

        if (!response.ok || !data.success) throw new Error(data.message || 'Risposta non valida dal server');

        document.getElementById('modal-current-pvc').innerText = data.global_allocated_gb;
        document.getElementById('modal-free-space').innerText  = data.safe_free;

        if (sizeInput) {
            sizeInput.max = data.safe_free;
            const hint = document.getElementById('modal-max-hint');
            if (hint) hint.innerText = `max ${data.safe_free} GB`;
        }

        // Renderizza dettaglio servizi
        const listEl = document.getElementById('services-breakdown-list');
        if (listEl) {
            listEl.innerHTML = '';
            const bd = data.services_breakdown || {};
            if (Object.keys(bd).length > 0) {
                for (const [name, gb] of Object.entries(bd)) {
                    const div = document.createElement('div');
                    div.className = 'breakdown-row';
                    div.innerHTML = `
                        <span class="br-name">
                            <span class="br-dot"></span>
                            ${name.charAt(0).toUpperCase() + name.slice(1)}
                        </span>
                        <span class="br-val">${gb} GB</span>`;
                    listEl.appendChild(div);
                }
            } else {
                listEl.innerHTML = '<div class="breakdown-row" style="color: var(--fg-muted);">Nessun servizio allocato al momento.</div>';
            }
        }
    } catch (e) {
        console.error('Errore accounting storage:', e);
        document.getElementById('modal-current-pvc').innerText = 'Errore';
        document.getElementById('modal-free-space').innerText  = 'Errore API';
    } finally {
        document.getElementById('storage-loading').style.display = 'none';
        document.getElementById('storage-controls').style.display = 'block';
    }
}

function closeStorageModal() {
    document.getElementById('storage-modal').classList.remove('show');
}

// Chiudi cliccando fuori dal box
document.addEventListener('DOMContentLoaded', () => {
    const overlay = document.getElementById('storage-modal');
    if (overlay) {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) closeStorageModal();
        });
    }
});

// --- ESPANSIONE STORAGE (STREAMING) ---
async function expandStorage() {
    const selectedService = currentTargetService;
    const newSize  = document.getElementById('new_pvc_size').value;
    const maxFree  = parseFloat(document.getElementById('new_pvc_size').max);

    if (!selectedService)                        return alert('Errore interno: nessun servizio selezionato.');
    if (!newSize || isNaN(newSize) || parseInt(newSize) <= 0) return alert('Inserisci un valore valido in GB.');
    if (maxFree && parseInt(newSize) > maxFree)  return alert(`Lo spazio richiesto supera il limite sicuro (${maxFree} GB).`);

    const btn       = document.getElementById('btn-expand');
    const consoleEl = document.getElementById('resize-console');

    btn.disabled    = true;
    btn.innerText   = '⏳ Espansione in corso...';
    consoleEl.style.display = 'block';
    consoleEl.innerText     = `Avvio espansione ${selectedService}...\n`;

    try {
        const response = await fetch(`/api/services/${selectedService}/expand_storage`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ new_size: parseInt(newSize) })
        });

        const reader  = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let buffer    = '';

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
                        consoleEl.innerText += parsed.log;
                        consoleEl.scrollTop  = consoleEl.scrollHeight;
                    }

                    if (parsed.success === true) {
                        btn.innerText = '✅ Completato!';
                        setTimeout(() => {
                            btn.disabled  = false;
                            btn.innerText = '🚀 Applica Espansione';
                            openStorageModal(currentTargetService);
                            loadDashboardData();
                        }, 2500);
                    } else if (parsed.success === false) {
                        btn.disabled  = false;
                        btn.innerText = '❌ Fallito — Riprova';
                    }
                } catch (_) { /* riga non-JSON, ignorata */ }
            }
        }
    } catch (error) {
        consoleEl.innerText += '\nErrore di rete: ' + error.message;
        btn.disabled  = false;
        btn.innerText = '🚀 Riprova';
    }
}