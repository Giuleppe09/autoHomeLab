async function startSetup() {
    const pveIp = document.getElementById('pve_ip_init').value.trim();
    const statusText = document.getElementById('init-status');
    const btnStart = document.getElementById('btn-start');

    if (!pveIp) {
        statusText.style.color = "#f7768e";
        statusText.innerText = "❌ Per favore, inserisci l'IP del server Proxmox.";
        return;
    }

    // Blocca il tasto e mostra il messaggio di attesa
    btnStart.disabled = true;
    statusText.style.color = "#7aa2f7";
    statusText.innerText = "⏳ Connessione a Proxmox e recupero dati in corso. Attendi...";

    try {
        const response = await fetch('/api/init_proxmox', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pve_ip: pveIp })
        });

        const data = await response.json();

        if (response.ok && data.success) {
            statusText.style.color = "#9ece6a";
            statusText.innerText = "✅ Connessione riuscita! Reindirizzamento in corso...";
            // Attende 1 secondo per far leggere il messaggio, poi cambia pagina
            setTimeout(() => { window.location.href = '/config'; }, 1000);
        } else {
            throw new Error(data.error || "Errore sconosciuto dal server.");
        }
    } catch (error) {
        statusText.style.color = "#f7768e";
        statusText.innerText = "❌ Errore di connessione: " + error.message;
        btnStart.disabled = false;
    }
}