#!/bin/bash
set -e

echo -e "\n🚀 [1/4] Setup Autenticazione e Chiavi..."
#ansible-playbook -i hosts.ini script/0_setup_auth.yml

echo -e "\n🚀 [2/4] Creazione Container LXC su Proxmox..."
#ansible-playbook -i hosts.ini script/1_create_lxc.yml

echo -e "\n🚀 [3/4] Installazione e Configurazione Tailscale nel Container..."
#ansible-playbook -i hosts.ini script/2_install_tailscale.yml

echo -e "\n🚀 [4/4] Setup Tailscale sul PC Locale..."
ansible-playbook -i hosts.ini script/3_setup_local_pc.yml


echo -e "\n✅  Tailscale pronto.\n"
