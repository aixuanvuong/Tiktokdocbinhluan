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

# Backup & temporarily move local db.json to prevent git merge conflicts
HAS_LOCAL_DB=false
if [ -f "data/db.json" ]; then
    HAS_LOCAL_DB=true
    mkdir -p .backup
    cp -f data/db.json .backup/db.json.bak.$(date +%s)
    mv -f data/db.json data/db.json.temp_backup
fi

# Tự động stash các thay đổi cục bộ không cố ý để tránh xung đột git pull
git stash 2>/dev/null || true

# Fetch and pull cleanly
git fetch origin main || git fetch || true
git pull origin main || git pull || true

# Restore local database so users and passwords are preserved
if [ "$HAS_LOCAL_DB" = true ] && [ -f "data/db.json.temp_backup" ]; then
    echo -e "${GREEN}💾 Khôi phục nguyên vẹn cơ sở dữ liệu người dùng (data/db.json)...${NC}"
    mkdir -p data
    mv -f data/db.json.temp_backup data/db.json
fi

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
