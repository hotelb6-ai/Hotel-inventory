const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 5000;

// 中間件
app.use(bodyParser.json());
app.use(cors());
app.use(express.static('public'));

// 資料庫連接
const dbPath = process.env.DATABASE_URL || './db.sqlite';
let db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('❌ 資料庫連接失敗:', err);
    // 即使資料庫失敗也讓服務器啟動
    setTimeout(() => {
      startServer();
    }, 1000);
  } else {
    console.log('✅ 資料庫連接成功');
    initDatabase();
  }
});

// 初始化資料庫
function initDatabase() {
  const tables = [
    `CREATE TABLE IF NOT EXISTS properties (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      group_id INTEGER
    )`,
    `CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      unit_size INTEGER NOT NULL,
      threshold_percent INTEGER DEFAULT 50
    )`,
    `CREATE TABLE IF NOT EXISTS inventory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      property_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      quantity INTEGER NOT NULL,
      recorded_date TEXT NOT NULL,
      FOREIGN KEY(property_id) REFERENCES properties(id),
      FOREIGN KEY(product_id) REFERENCES products(id),
      UNIQUE(property_id, product_id, recorded_date)
    )`,
    `CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_date TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      property_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      quantity_needed INTEGER NOT NULL,
      order_boxes INTEGER NOT NULL,
      FOREIGN KEY(order_id) REFERENCES orders(id),
      FOREIGN KEY(property_id) REFERENCES properties(id),
      FOREIGN KEY(product_id) REFERENCES products(id)
    )`,
    `CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      property_id INTEGER,
      role TEXT DEFAULT 'staff',
      FOREIGN KEY(property_id) REFERENCES properties(id)
    )`,
    `CREATE TABLE IF NOT EXISTS monthly_quotas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      property_id INTEGER NOT NULL,
      boxes_per_month INTEGER NOT NULL DEFAULT 5,
      FOREIGN KEY(product_id) REFERENCES products(id),
      FOREIGN KEY(property_id) REFERENCES properties(id),
      UNIQUE(product_id, property_id)
    )`
  ];

  let completed = 0;
  tables.forEach(statement => {
    db.run(statement, (err) => {
      if (err) {
        console.error('表格建立錯誤:', err);
      }
      completed++;
      if (completed === tables.length) {
        // 所有表都建立完成後再進行種子數據
        seedData();
      }
    });
  });
}

// 種子資料
function seedData() {
  const properties = [
    { name: '星美', group: 1 },
    { name: '俞美', group: 2 },
    { name: '中正', group: 3 },
    { name: '福榮', group: 3 },
    { name: '大西', group: 4 },
    { name: '小西', group: 5 },
    { name: '福壽', group: 6 },
    { name: '大東', group: 7 }
  ];

  const products = [
    { name: '優活小捲衛生紙', size: 60 },
    { name: '優活面紙', size: 60 },
    { name: '連潔小垃圾袋', size: 1 },
    { name: '連結大垃圾袋', size: 1 },
    { name: '綠茶包', size: 100 },
    { name: '烏龍茶包', size: 100 },
    { name: '洋甘菊茶包', size: 280 },
    { name: '咖啡包', size: 100 },
    { name: '奶茶包', size: 100 },
    { name: '條棒', size: 500 },
    { name: '牙刷', size: 250 },
    { name: '紙拖', size: 500 },
    { name: '沐浴乳', size: 1 },
    { name: '洗髮精', size: 1 },
    { name: '擦手紙', size: 8 },
    { name: '漂白水', size: 1 }
  ];

  // 插入館別
  properties.forEach(prop => {
    db.run(
      'INSERT OR IGNORE INTO properties (name, group_id) VALUES (?, ?)',
      [prop.name, prop.group],
      (err) => {
        if (err) console.error('插入館別錯誤:', err);
      }
    );
  });

  // 插入備品
  products.forEach(prod => {
    db.run(
      'INSERT OR IGNORE INTO products (name, unit_size, threshold_percent) VALUES (?, ?, ?)',
      [prod.name, prod.size, 50],
      (err) => {
        if (err) console.error('插入備品錯誤:', err);
      }
    );
  });

  // 建立測試用戶
  const users = [
    { username: 'admin', password: 'admin123', property_id: null, role: 'admin' },
    { username: '星美', password: 'pass123', property_id: 1, role: 'staff' },
    { username: '俞美', password: 'pass123', property_id: 2, role: 'staff' },
    { username: '中正', password: 'pass123', property_id: 3, role: 'staff' },
    { username: '福榮', password: 'pass123', property_id: 4, role: 'staff' },
    { username: '大西', password: 'pass123', property_id: 5, role: 'staff' },
    { username: '小西', password: 'pass123', property_id: 6, role: 'staff' },
    { username: '福壽', password: 'pass123', property_id: 7, role: 'staff' },
    { username: '大東', password: 'pass123', property_id: 8, role: 'staff' }
  ];

  users.forEach(user => {
    db.run(
      'INSERT OR IGNORE INTO users (username, password, property_id, role) VALUES (?, ?, ?, ?)',
      [user.username, user.password, user.property_id, user.role],
      (err) => {
        if (err) console.error('插入用戶錯誤:', err);
      }
    );
  });

  // 初始化月度配額（預設每個備品每個館別每月叫5箱）
  setTimeout(() => {
    for (let propId = 1; propId <= 8; propId++) {
      for (let prodId = 1; prodId <= 16; prodId++) {
        db.run(
          'INSERT OR IGNORE INTO monthly_quotas (product_id, property_id, boxes_per_month) VALUES (?, ?, ?)',
          [prodId, propId, 5],
          (err) => {
            if (err) console.error('初始化月度配額錯誤:', err);
          }
        );
      }
    }
  }, 1000);

  console.log('✅ 資料初始化完成');
}

// ========== API 路由 ==========

// 登入
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  db.get(
    'SELECT id, username, role, property_id FROM users WHERE username = ? AND password = ?',
    [username, password],
    (err, row) => {
      if (err) {
        return res.status(500).json({ error: '資料庫錯誤' });
      }
      if (!row) {
        return res.status(401).json({ error: '帳號或密碼錯誤' });
      }
      res.json({
        success: true,
        user: {
          id: row.id,
          username: row.username,
          role: row.role,
          property_id: row.property_id
        }
      });
    }
  );
});

// 獲取所有館別
app.get('/api/properties', (req, res) => {
  db.all('SELECT * FROM properties ORDER BY id', (err, rows) => {
    if (err) return res.status(500).json({ error: '資料庫錯誤' });
    res.json(rows);
  });
});

// 獲取所有備品
app.get('/api/products', (req, res) => {
  db.all('SELECT * FROM products ORDER BY id', (err, rows) => {
    if (err) return res.status(500).json({ error: '資料庫錯誤' });
    res.json(rows);
  });
});

// 獲取月度配額設定
app.get('/api/monthly-quotas', (req, res) => {
  db.all(
    `SELECT mq.*, pd.name as product_name, pr.name as property_name, pd.unit_size
     FROM monthly_quotas mq
     JOIN products pd ON mq.product_id = pd.id
     JOIN properties pr ON mq.property_id = pr.id
     ORDER BY mq.property_id, mq.product_id`,
    (err, rows) => {
      if (err) return res.status(500).json({ error: '資料庫錯誤' });
      res.json(rows);
    }
  );
});

// 獲取特定館別的月度配額
app.get('/api/monthly-quotas/:propertyId', (req, res) => {
  const propertyId = req.params.propertyId;
  db.all(
    `SELECT mq.*, pd.name as product_name, pd.unit_size
     FROM monthly_quotas mq
     JOIN products pd ON mq.product_id = pd.id
     WHERE mq.property_id = ?
     ORDER BY mq.product_id`,
    [propertyId],
    (err, rows) => {
      if (err) return res.status(500).json({ error: '資料庫錯誤' });
      res.json(rows);
    }
  );
});

// 更新月度配額
app.put('/api/monthly-quotas/:id', (req, res) => {
  const { boxes_per_month } = req.body;
  const id = req.params.id;

  db.run(
    'UPDATE monthly_quotas SET boxes_per_month = ? WHERE id = ?',
    [boxes_per_month, id],
    function(err) {
      if (err) return res.status(500).json({ error: '更新失敗' });
      res.json({ success: true, message: '更新成功' });
    }
  );
});

// 提交庫存
app.post('/api/inventory/submit', (req, res) => {
  const { property_id, inventory_data } = req.body;
  const today = new Date().toISOString().split('T')[0];

  let completed = 0;
  const total = inventory_data.length;

  inventory_data.forEach(item => {
    const { product_id, quantity } = item;
    db.run(
      `INSERT OR REPLACE INTO inventory (property_id, product_id, quantity, recorded_date)
       VALUES (?, ?, ?, ?)`,
      [property_id, product_id, quantity, today],
      (err) => {
        if (err) console.error('庫存提交錯誤:', err);
        completed++;
        if (completed === total) {
          // 所有庫存都提交後，檢查是否需要生成叫貨單
          generateOrder(res);
        }
      }
    );
  });
});

// 生成叫貨單
function generateOrder(res) {
  const today = new Date().toISOString().split('T')[0];

  // 檢查今天是否已生成過訂單
  db.get(
    'SELECT id FROM orders WHERE DATE(order_date) = ?',
    [today],
    (err, existingOrder) => {
      if (existingOrder) {
        return res.json({ success: true, message: '今日已生成訂單' });
      }

      // 獲取今日所有庫存記錄
      db.all(
        `SELECT
          i.property_id,
          i.product_id,
          i.quantity,
          pd.unit_size,
          pr.name as property_name,
          pd.name as product_name,
          pr.group_id
        FROM inventory i
        JOIN properties pr ON i.property_id = pr.id
        JOIN products pd ON i.product_id = pd.id
        WHERE i.recorded_date = ?
        ORDER BY i.property_id, i.product_id`,
        [today],
        (err, rows) => {
          if (err || !rows || rows.length === 0) {
            return res.json({ success: true, message: '沒有庫存記錄' });
          }

          // 建立訂單
          db.run(
            'INSERT INTO orders (order_date, status) VALUES (?, ?)',
            [today, 'pending'],
            function(err) {
              if (err) return res.status(500).json({ error: '訂單建立失敗' });

              const orderId = this.lastID;

              // 使用月度配額計算需叫貨量
              // 先依據群組合併庫存（中正+福榮）
              const groupedInventory = {};
              const propertyMap = {}; // 記錄屬於各群組的館別

              rows.forEach(row => {
                const key = `${row.group_id}_${row.product_id}`;
                if (!groupedInventory[key]) {
                  groupedInventory[key] = {
                    group_id: row.group_id,
                    product_id: row.product_id,
                    product_name: row.product_name,
                    unit_size: row.unit_size,
                    properties: [],
                    total_quantity: 0
                  };
                  propertyMap[key] = [];
                }
                groupedInventory[key].properties.push({
                  property_id: row.property_id,
                  property_name: row.property_name,
                  quantity: row.quantity
                });
                groupedInventory[key].total_quantity += row.quantity;
                propertyMap[key].push(row.property_id);
              });

              // 對每個合併的館別-備品組合計算叫貨量
              let itemsToProcess = Object.keys(groupedInventory).length;
              let processedItems = 0;

              Object.values(groupedInventory).forEach(item => {
                // 取第一個館別的月度配額作為群組配額
                const firstPropId = item.properties[0].property_id;

                db.get(
                  `SELECT boxes_per_month FROM monthly_quotas
                   WHERE product_id = ? AND property_id = ?`,
                  [item.product_id, firstPropId],
                  (err, quota) => {
                    const quotaBoxes = quota ? quota.boxes_per_month : 5; // 預設5箱
                    const availableBoxes = Math.floor(item.total_quantity / item.unit_size);
                    const boxesToOrder = Math.max(0, quotaBoxes - availableBoxes);

                    // 如果需要叫貨，為每個相關館別建立訂單項目
                    if (boxesToOrder > 0) {
                      let propProcessed = 0;
                      item.properties.forEach(prop => {
                        db.run(
                          `INSERT INTO order_items
                           (order_id, property_id, product_id, quantity_needed, order_boxes)
                           VALUES (?, ?, ?, ?, ?)`,
                          [orderId, prop.property_id, item.product_id, prop.quantity, boxesToOrder],
                          (err) => {
                            if (err) console.error('訂單項目錯誤:', err);
                            propProcessed++;
                            if (propProcessed === item.properties.length) {
                              processedItems++;
                              if (processedItems === itemsToProcess) {
                                res.json({
                                  success: true,
                                  message: '庫存已提交，叫貨單已生成',
                                  order_id: orderId
                                });
                              }
                            }
                          }
                        );
                      });
                    } else {
                      processedItems++;
                      if (processedItems === itemsToProcess) {
                        res.json({
                          success: true,
                          message: '庫存已提交',
                          order_id: orderId
                        });
                      }
                    }
                  }
                );
              });
            }
          );
        }
      );
    }
  );
}

// 獲取最新訂單
app.get('/api/orders/latest', (req, res) => {
  db.all(
    `SELECT
      o.id, o.order_date, o.status,
      oi.property_id, oi.product_id, oi.quantity_needed, oi.order_boxes,
      pr.name as property_name, pd.name as product_name
    FROM orders o
    LEFT JOIN order_items oi ON o.id = oi.order_id
    LEFT JOIN properties pr ON oi.property_id = pr.id
    LEFT JOIN products pd ON oi.product_id = pd.id
    ORDER BY o.id DESC LIMIT 100`,
    (err, rows) => {
      if (err) return res.status(500).json({ error: '資料庫錯誤' });

      // 結構化資料
      const orders = {};
      rows.forEach(row => {
        if (!orders[row.id]) {
          orders[row.id] = {
            id: row.id,
            order_date: row.order_date,
            status: row.status,
            items: []
          };
        }
        if (row.property_id) {
          orders[row.id].items.push({
            property_id: row.property_id,
            property_name: row.property_name,
            product_id: row.product_id,
            product_name: row.product_name,
            quantity_needed: row.quantity_needed,
            order_boxes: row.order_boxes
          });
        }
      });

      res.json(Object.values(orders));
    }
  );
});

// 獲取庫存歷史
app.get('/api/inventory/:propertyId', (req, res) => {
  const propertyId = req.params.propertyId;
  db.all(
    `SELECT
      i.product_id, i.quantity, i.recorded_date,
      pd.name as product_name, pd.unit_size
    FROM inventory i
    JOIN products pd ON i.product_id = pd.id
    WHERE i.property_id = ?
    ORDER BY i.recorded_date DESC, i.product_id`,
    [propertyId],
    (err, rows) => {
      if (err) return res.status(500).json({ error: '資料庫錯誤' });
      res.json(rows);
    }
  );
});

// 啟動伺服器函數
function startServer() {
  app.listen(PORT, () => {
    console.log(`\n🚀 飯店庫存系統已啟動`);
    console.log(`📍 訪問地址: http://localhost:${PORT}`);
    console.log(`\n登入帳號:`);
    console.log(`  👤 管理員: admin / admin123`);
    console.log(`  🏨 各館別: 星美/俞美/中正/福榮/大西/小西/福壽/大東 / pass123`);
    console.log(`\n按 Ctrl+C 停止服務\n`);
  });
}

// 資料庫初始化完成後啟動
if (db) {
  setTimeout(() => {
    startServer();
  }, 2000);
}

// 優雅關閉
process.on('SIGINT', () => {
  db.close((err) => {
    if (err) console.error('資料庫關閉錯誤:', err);
    console.log('\n✅ 伺服器已停止');
    process.exit(0);
  });
});
