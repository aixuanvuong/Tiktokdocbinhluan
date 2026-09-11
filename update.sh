#!/bin/bash
# ==============================================================================
# 🔄 TIKTOK LIVE READER - ONE-CLICK AUTO UPDATE SCRIPT FOR UBUNTU SERVER
# ==============================================================================
set -e

GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${CYAN}======================================================${NC}"
echo -e "${CYAN}🔄 BẮT ĐẦU CẬP NHẬT PHIÊN BẢN MỚI TIKTOK LIVE READER${NC}"
echo -e "${CYAN}======================================================${NC}"

# 1. Pull latest code from GitHub
echo -e "\n${YELLOW}👉 [1/4] Đang kéo mã nguồn mới nhất từ GitHub (git pull)...${NC}"
git pull origin main || git pull

# 2. Update NPM Dependencies
echo -e "\n${YELLOW}👉 [2/4] Đang cập nhật gói thư viện (npm install)...${NC}"
npm install

# 3. Build Project
echo -e "\n${YELLOW}👉 [3/4] Đang đóng gói bản dựng sản phẩm (npm run build)...${NC}"
npm run build

# 4. Restart Application in PM2
echo -e "\n${YELLOW}👉 [4/4] Đang khởi động lại dịch vụ với PM2...${NC}"
pm2 restart tiktok-live-reader || pm2 start dist/server.cjs --name "tiktok-live-reader"

# Install or update tiktokxv CLI
chmod +x tiktokxv 2>/dev/null || true
chmod +x setup.sh 2>/dev/null || true
chmod +x update.sh 2>/dev/null || true
sudo cp -f tiktokxv /usr/local/bin/tiktokxv 2>/dev/null || cp -f tiktokxv /usr/local/bin/tiktokxv 2>/dev/null || true
chmod +x /usr/local/bin/tiktokxv 2>/dev/null || true

echo -e "\n${GREEN}======================================================${NC}"
echo -e "${GREEN}🎉 CẬP NHẬT PHIÊN BẢN MỚI THÀNH CÔNG!${NC}"
echo -e "${GREEN}======================================================${NC}"
echo -e "${CYAN}📊 Trạng thái dịch vụ PM2:${NC}"
pm2 status
echo -e "\n${CYAN}💡 Lệnh quản lý:${NC} Bạn có thể gõ ${GREEN}tiktokxv${NC} để mở Menu quản lý."
echo -e "======================================================\n"
