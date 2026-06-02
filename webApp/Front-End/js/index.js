async function startSetup() {
    const pveIp = document.getElementById('pve_ip_init').value.trim();
    const statusText = document.getElementById('init-status');
    const btnStart = document.getElementById('btn-start');

    if (!pveIp) {
        statusText.style.color = "#f7768e";
        statusText.innerText = "❌ Per favore, inserisci l'IP del server Proxmox.";
        return;
    }

    btnStart.disabled = true;
    statusText.style.color = "#7aa2f7";
    statusText.innerText = "⏳ Recupero informazioni da Proxmox in corso...";

    // Creiamo o recuperiamo il box della console live
    let consoleBox = document.getElementById('init-console');
    if (!consoleBox) {
        consoleBox = document.createElement('pre');
        consoleBox.id = 'init-console';
        consoleBox.style.cssText = "background: #1f2335; color: #a9b1d6; padding: 15px; border-radius: 8px; margin-top: 20px; font-size: 13px; overflow-y: auto; max-height: 250px; white-space: pre-wrap; text-align: left; border: 1px solid #414868;";
        statusText.parentNode.appendChild(consoleBox);
    }
    consoleBox.classList.remove('hidden');
    consoleBox.innerText = "Connessione in corso...\n";

    try {
        const response = await fetch('/api/init_proxmox', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pve_ip: pveIp })
        });

        if (!response.ok) {
            throw new Error(await response.text());
        }

        // Lettura dello stream live
        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let fullLog = "";
        
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value, { stream: true });
            consoleBox.innerText += chunk;
            fullLog += chunk;
            consoleBox.scrollTop = consoleBox.scrollHeight; // Autoscroll automatico
        }

        // Controllo se l'output contiene l'errore sollevato dal backend
        if (fullLog.includes("❌ Errore") || fullLog.includes("Non è stato possibile")) {
            throw new Error("Errore durante l'esecuzione del playbook.");
        }

        // Finalizzazione: Salvataggio in sessione dei dati estratti
        const finalResp = await fetch('/api/init_proxmox_finalize', { method: 'POST' });
        if (finalResp.ok) {
            statusText.style.color = "#9ece6a";
            statusText.innerText = "✅ Connessione riuscita! Reindirizzamento in corso...";
            setTimeout(() => { window.location.href = '/config'; }, 1000);
        } else {
            throw new Error(await finalResp.text());
        }
    } catch (error) {
        statusText.style.color = "#f7768e";
        statusText.innerText = "❌ Non è stato possibile ottenere informazioni dal Server Proxmox.";
        btnStart.disabled = false;
    }
}