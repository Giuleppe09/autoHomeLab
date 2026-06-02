import subprocess
import platform
import concurrent.futures
import ipaddress

class NetworkService:
    @staticmethod
    def _ping_ip(ip):
        ping_cmd = ['ping', '-c', '1', '-W', '1', ip]
        if platform.system() == "Windows":
            ping_cmd = ['ping', '-n', '1', '-w', '1000', ip]
        # Eseguiamo il ping solo per "svegliare" i dispositivi silenti e forzarli nell'ARP
        subprocess.run(ping_cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    @staticmethod
    def scan_for_free_ips(gateway, pve_ip=None):
        # --- INIZIO MOCK PER TESTING ---
        if pve_ip == "test":
            # Restituiamo un set di IP fittizio per sbloccare la tendina nel Front-end
            return ["192.168.1.200", "192.168.1.201", "192.168.1.202"]
        # --- FINE MOCK ---

        # Estraiamo la base della subnet dal gateway (Es: 192.168.1.254 -> 192.168.1)
        base_ip = ".".join(gateway.split(".")[:3])
        pool_ips = [f"{base_ip}.{i}" for i in range(200, 221)]
        
        # 1. Ping Sweep Parallelo (Multi-thread) 
        # Usiamo 20 worker così in ~1 secondo scansioniamo tutti e 20 gli IP
        with concurrent.futures.ThreadPoolExecutor(max_workers=20) as executor:
            executor.map(NetworkService._ping_ip, pool_ips)
            
        # 2. Lettura Tabella ARP
        used_ips_from_arp = []
        try:
            if platform.system() == "Windows":
                arp_output = subprocess.run(['arp', '-a'], capture_output=True, text=True).stdout
                for line in arp_output.splitlines():
                    parts = line.split()
                    # Verifica somiglianza base a un MAC address su Windows
                    if len(parts) >= 2 and parts[1].count('-') == 5:
                        used_ips_from_arp.append(parts[0])
            else:
                arp_output = subprocess.run(['ip', 'neigh'], capture_output=True, text=True).stdout
                for line in arp_output.splitlines():
                    # Su Linux REACHABLE e STALE indicano host noti e attivi (o attivi di recente)
                    if "lladdr" in line or "REACHABLE" in line or "STALE" in line:
                        used_ips_from_arp.append(line.split()[0])
        except Exception as e:
            print(f"Errore lettura ARP: {e}")

        # 3. Filtriamo gli IP: prendiamo solo quelli del pool NON presenti in ARP
        free_ips = [ip for ip in pool_ips if ip not in used_ips_from_arp]
        
        return free_ips

    @staticmethod
    def is_ip_valid_cidr(ip_cidr):
        try:
            ipaddress.ip_interface(ip_cidr)
            return True
        except ValueError:
            return False

    @staticmethod
    def is_ip_in_use(ip_cidr):
        # Estraiamo solo l'IP ignorando la subnet mask per il ping
        ip = ip_cidr.split('/')[0] if '/' in ip_cidr else ip_cidr
        ping_cmd = ['ping', '-c', '1', '-W', '1', ip]
        if platform.system() == "Windows":
            ping_cmd = ['ping', '-n', '1', '-w', '1000', ip]
            
        result = subprocess.run(ping_cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        return result.returncode == 0  # True se risponde al ping (cioè è in uso)