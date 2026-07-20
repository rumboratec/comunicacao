McrMatriz2026
npx http-server -p 6077 -S -C 192.168.1.20+2.pem -K 192.168.1.20+2-key.pem

sudo apt install libnss3-tools -y
sudo wget https://github.com/FiloSottile/mkcert/releases/download/v1.4.4/mkcert-v1.4.4-linux-amd64 -O /usr/local/bin/mkcert
sudo chmod +x /usr/local/bin/mkcert
mkcert -install
hostname -I | awk '{print $1}'
mkcert 192.168.1.20 localhost 127.0.0.1
ls
