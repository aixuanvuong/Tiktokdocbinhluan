#!/bin/bash
# ==============================================================================
# 🚀 TIKTOK LIVE READER - ONE-CLICK AUTO INSTALLER WITH DOMAIN & SSL FOR UBUNTU
# ==============================================================================
set -e

GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${CYAN}======================================================${NC}"
echo -e "${CYAN}🚀 BẮT ĐẦU CÀI ĐẶT TỰ ĐỘNG TIKTOK LIVE READER TRÊN UBUNTU${NC}"
echo -e "${CYAN}======================================================${NC}"

# Ask for Domain Configuration
if [ -z "$DOMAIN" ]; then
    echo -e "\n${YELLOW}🌐 CẤU HÌNH TÊN MIỀN (DOMAIN NAME):${NC}"
    echo -e "Nếu bạn đã trỏ Tên miền (VD: live.yourdomain.com) về IP Server này, hãy nhập bên dưới."
    echo -e "Nếu chưa có Tên miền, nhấn ${GREEN}[ENTER]${NC} để truy cập trực tiếp bằng IP qua cổng 3000."
    read -p "👉 Nhập Tên miền của bạn (hoặc nhấn Enter để bỏ qua): " DOMAIN
fi

# 1. Update Ubuntu Packages & Utilities
echo -e "\n${YELLOW}👉 [1/6] Đang cập nhật hệ thống và cài đặt công cụ cần thiết...${NC}"
sudo apt-get update -y
sudo apt-get install -y curl git build-essential ufw

# 2. Check & Install Node.js 20 LTS
if ! command -v node &> /dev/null; then
    echo -e "\n${YELLOW}👉 [2/6] Đang cài đặt Node.js 20 LTS...${NC}"
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
else
    echo -e "\n${GREEN}✅ Node.js đã có sẵn: $(node -v)${NC}"
fi

# 3. Check & Install PM2 Process Manager
echo -e "\n${YELLOW}👉 [3/6] Đang cài đặt PM2 Process Manager...${NC}"
sudo npm install -g pm2

# 4. Install Project Dependencies
echo -e "\n${YELLOW}👉 [4/6] Đang cài đặt các thư viện Node.js (npm install)...${NC}"
npm install

# 5. Build Project for Production
echo -e "\n${YELLOW}👉 [5/6] Đang đóng gói ứng dụng (npm run build)...${NC}"
npm run build

# 6. Start Application with PM2
echo -e "\n${YELLOW}👉 [6/6] Đang khởi chạy ứng dụng với PM2...${NC}"
pm2 stop tiktok-live-reader 2>/dev/null || true
pm2 delete tiktok-live-reader 2>/dev/null || true
pm2 start dist/server.cjs --name "tiktok-live-reader"

# Save PM2 process list and configure startup boot
pm2 save
sudo env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u $USER --hp $HOME 2>/dev/null || pm2 startup || true

# Allow Port 3000 on Firewall if UFW enabled
sudo ufw allow 3000/tcp 2>/dev/null || true

# Get Server Public IP
PUBLIC_IP=$(curl -s --max-time 3 ifconfig.me || curl -s --max-time 3 api.ipify.org || echo "IP_SERVER_CỦA_BẠN")

# 7. Setup Domain & Nginx Reverse Proxy & SSL (If Domain provided)
DOMAIN_URL="http://${PUBLIC_IP}:3000"

if [ -n "$DOMAIN" ]; then
    # Clean domain input (remove http:// or https:// or trailing slashes)
    CLEAN_DOMAIN=$(echo "$DOMAIN" | sed -e 's|^https\?://||' -e 's|/.*$||' | xargs)
    
    echo -e "\n${YELLOW}⚙️ Đang cấu hình Nginx Reverse Proxy & SSL cho tên miền: ${GREEN}${CLEAN_DOMAIN}${NC}..."
    sudo apt-get install -y nginx certbot python3-certbot-nginx

    # Allow Port 80 & 443
    sudo ufw allow 80/tcp 2>/dev/null || true
    sudo ufw allow 443/tcp 2>/dev/null || true

    # Create Nginx Config
    NGINX_CONF="/etc/nginx/sites-available/tiktok-live-reader"
    sudo bash -c "cat > ${NGINX_CONF}" <<EOF
server {
    listen 80;
    server_name ${CLEAN_DOMAIN};

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }
}
EOF

    # Enable site
    sudo ln -sf "$NGINX_CONF" /etc/nginx/sites-enabled/
    sudo rm -f /etc/nginx/sites-enabled/default 2>/dev/null || true
    sudo nginx -t && sudo systemctl reload nginx

    # Install SSL Certbot
    echo -e "\n${YELLOW}🔒 Đang đăng ký chứng chỉ SSL miễn phí (HTTPS) từ Let's Encrypt...${NC}"
    if [ -z "$EMAIL" ]; then
        read -p "👉 Nhập Email của bạn để đăng ký SSL (Ví dụ: admin@gmail.com): " EMAIL
    fi

    if [ -n "$EMAIL" ]; then
        sudo certbot --nginx -d "$CLEAN_DOMAIN" --non-interactive --agree-tos -m "$EMAIL" --redirect || echo -e "${RED}⚠️ Đăng ký SSL chưa thành công (Do tên miền chưa trỏ về IP $PUBLIC_IP). Bạn có thể đăng ký sau bằng lệnh: sudo certbot --nginx -d $CLEAN_DOMAIN${NC}"
    fi

    DOMAIN_URL="https://${CLEAN_DOMAIN}"
fi

echo -e "\n${GREEN}======================================================${NC}"
echo -e "${GREEN}🎉 CÀI ĐẶT HOÀN TẤT THÀNH CÔNG!${NC}"
echo -e "${GREEN}======================================================${NC}"
echo -e "${CYAN}📊 Trạng thái dịch vụ PM2:${NC}"
pm2 status
echo -e "\n${CYAN}🌐 Mở trình duyệt và truy cập ứng dụng từ xa tại:${NC}"
echo -e "   👉 ${GREEN}${DOMAIN_URL}${NC}"
if [ -n "$CLEAN_DOMAIN" ]; then
    echo -e "   (Hoặc qua IP trực tiếp: http://${PUBLIC_IP}:3000)"
fi
echo -e "======================================================\n"
