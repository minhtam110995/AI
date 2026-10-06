#!/bin/bash
cd "$(dirname "$0")"
command -v node >/dev/null || { echo "Chưa cài Node.js. Tải tại https://nodejs.org (bản LTS) rồi chạy lại."; read; exit 1; }
[ -d node_modules ] || { echo "Đang cài thư viện lần đầu, vui lòng đợi vài phút..."; npm install; }
(sleep 3; open http://localhost:3210) &
node server/index.js
