# 🏨 飯店庫存管理系統

簡易的飯店備品庫存管理與自動叫貨系統

## 功能特性

- 📝 月底庫存填報（各館獨立填報）
- 🤖 自動叫貨計算（根據月度設定）
- 📦 自動生成採購單
- 📊 管理員設定月度叫貨量
- 📋 歷史記錄追蹤
- 🏢 支援8個館別（含中正+福榮合併計算）

## 本地運行

### 安裝
```bash
npm install
```

### 啟動
```bash
npm start
```

訪問 http://localhost:5000

### 測試帳號
- 管理員: admin / admin123
- 各館: 星美/俞美/中正/福榮/大西/小西/福壽/大東 / pass123

## 部署到 Railway

### 第一步：創建 Railway 帳號
1. 訪問 https://railway.app
2. 用 GitHub/Google 帳號註冊

### 第二步：連接代碼倉庫
如果你有 GitHub 帳號：
1. 在 GitHub 創建新倉庫
2. 推送本地代碼到 GitHub
3. 在 Railway 連接 GitHub 倉庫

如果沒有 GitHub：
1. 在 Railway 直接上傳 ZIP 文件
2. 或聯繫開發者幫助部署

### 第三步：部署
1. Railway 自動偵測到 Procfile
2. 自動安裝依賴並部署
3. 獲得公開網址（如 https://your-app.railway.app）

## 環境變數

部署時無需配置特殊環境變數，系統會自動：
- 創建 SQLite 資料庫
- 初始化所有表格和測試數據

## 資料庫

使用 SQLite（自動在運行時創建）

表格結構：
- `properties` - 館別
- `products` - 備品
- `inventory` - 庫存記錄
- `monthly_quotas` - 月度叫貨設定
- `orders` - 叫貨單
- `order_items` - 叫貨明細
- `users` - 用戶帳號

## 修改和更新

部署後仍可隨時修改：
1. 修改本地代碼
2. 推送到 GitHub（或直接上傳到 Railway）
3. 系統自動重新部署
4. 線上版本自動更新

## 支援

如需幫助，聯繫開發團隊
