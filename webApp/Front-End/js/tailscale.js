async function runTailscaleSetup() {
    const consoleOutput = document.getElementById('console-output');
    const btnRun = document.getElementById('btn-run');
    const btnNext = document.getElementById('btn-next');
    
    // Mostra la console e resetta lo stato visivo
    consoleOutput.classList.remove('hidden');
    btnRun.disabled = true;
    btnRun.innerText = "⏳ Installazione in corso...";
    consoleOutput.innerText = "Avvio processi Ansible...\n\n";

    try {
        const response = await fetch('/api/tailscale/setup', { method: 'POST' });

        if (!response.ok) {
            throw new Error(await response.text());
        }
        
        // Logica di Stream (Identica a NFS)
        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
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
                        // Aggiunge un po' di spazio per leggibilità tra un play e l'altro
                        if (parsed.log.includes("PLAY [")) {
                            consoleOutput.innerText += "\n"; 
                        }
                        consoleOutput.innerText += parsed.log;
                        consoleOutput.scrollTop = consoleOutput.scrollHeight; // Autoscroll verso il basso
                    }

                    // Attivazione del bottone Prosegui al successo
                    if (parsed.success === true) {
                        btnRun.innerText = "Completato ✔️";
                        btnRun.classList.replace('btn-primary', 'btn-secondary');
                        
                        btnNext.classList.remove('hidden');
                        btnNext.disabled = false;
                    }
                } catch (e) {
                    console.error("Errore nel parsing del log (JSON):", e, line);
                }
            }
        }
    } catch (error) {
        console.error("Errore di rete:", error);
        consoleOutput.innerText += "\n❌ Errore di connessione: il server non risponde o ha chiuso la connessione inaspettatamente.";
        btnRun.innerText = "Riprova Avvio";
        btnRun.disabled = false;
    }
}