#!/bin/bash
set -e

echo -e "\n🔥 [1/4] Pulizia nodi dalla Admin Console Cloud di Tailscale..."
ansible-playbook -i hosts.ini prune/prune_1_tailscale_cloud.yml

echo -e "\n🔥 [2/4] Disinstallazione Tailscale dal PC Locale..."
ansible-playbook -i hosts.ini prune/prune_2_local_pc.yml

echo -e "\n🔥 [3/4] Distruzione del Container LXC su Proxmox..."
ansible-playbook -i hosts.ini prune/prune_3_lxc.yml

echo -e "\n🔥 [4/4] Rimozione Utenti API, Token e Chiavi Locali..."
ansible-playbook -i hosts.ini prune/prune_4_auth.yml

echo -e "\n✅ DISTRUZIONE (PRUNE) COMPLETATA CON SUCCESSO! L'ambiente è tornato allo stato zero.\n"