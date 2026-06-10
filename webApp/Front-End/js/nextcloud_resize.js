function openResizeModal() {
    document.getElementById('resize-modal').classList.remove('hidden');
    document.getElementById('resize-console-output').classList.add('hidden');
    document.getElementById('resize-console-output').innerText = '';
    document.getElementById('add-gb-input').value = '';
    
    const btn = document.getElementById('btn-confirm-resize');
    btn.disabled = false;
    btn.innerText = "Espandi Storage";
}

function closeResizeModal() {
    document.getElementById('resize-modal').classList.add('hidden');
}

async function confirmResize() {
    const addGb = document.getElementById('add-gb-input').value;
    const btn = document.getElementById('btn-confirm-resize');
    const consoleOutput = document.getElementById('resize-console-output');
    
    if (!addGb || addGb <= 0) {
        alert('Inserisci un valore in GB maggiore di 0 (es. 100).');
        return;
    }

    btn.disabled = true;
    btn.innerText = "Verifica spazio fisico (PVE)...";
    
    try {
        // 1. Chiamata API per check overprovisioning (Proxmox)
        const res = await fetch('/api/nextcloud/expand', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ add_gb: parseInt(addGb) })
        });
        
        const data = await res.json();
        
        if (!res.ok) {
            alert("⚠️ " + (data.error || "Impossibile espandere lo storage."));
            btn.disabled = false;
            btn.innerText = "Riprova";
            return;
        }
        
        const newTotal = data.new_total; // Il backend ha restituito il formato Kubernetes (es. "150Gi")
        
        // 2. Chiamata API per patch della PVC K8s (Streaming Ansatz)
        btn.innerText = "Patch PVC in Kubernetes...";
        consoleOutput.classList.remove('hidden');
        consoleOutput.innerText = `>>> Setup quota target: ${newTotal}\n\n`;
        
        const streamRes = await fetch('/api/nextcloud/expand/stream', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ new_size: newTotal })
        });
        
        const reader = streamRes.body.getReader();
        const decoder = new TextDecoder("utf-8");
        let buffer = "";
        
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
                        consoleOutput.innerText += parsed.log;
                        consoleOutput.scrollTop = consoleOutput.scrollHeight;
                    }
                    if (parsed.success) {
                        btn.innerText = "Espansione Completata ✔️";
                        btn.classList.replace('bg-green-600', 'bg-blue-600');
                        setTimeout(closeResizeModal, 4000); // Chiusura automatica a fine successo
                    }
                } catch (e) { console.error("Errore Parsing JSON log stream:", e); }
            }
        }
    } catch (error) {
        alert("Errore di rete con il Server Backend.");
        btn.disabled = false;
        btn.innerText = "Espandi Storage";
    }
}