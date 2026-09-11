#!/bin/bash
# ==============================================================================
# 🚀 TIKTOK LIVE READER - ONE-CLICK AUTO INSTALLER FOR UBUNTU SERVER
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

echo -e "\n${GREEN}======================================================${NC}"
echo -e "${GREEN}🎉 CÀI ĐẶT HOÀN TẤT THÀNH CÔNG!${NC}"
echo -e "${GREEN}======================================================${NC}"
echo -e "${CYAN}📊 Trạng thái dịch vụ PM2:${NC}"
pm2 status
echo -e "\n${CYAN}🌐 Mở trình duyệt và truy cập ứng dụng tại:${NC}"
echo -e "   👉 ${YELLOW}http://${PUBLIC_IP}:3000${NC}"
echo -e "======================================================\n"
