const express = require('express');
const { Pool } = require('pg');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 5000;

// PostgreSQL 連接
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://hotel_inventory_db_c4m9_user:QlQQcZtkmpRoVxDxTmn3lGjsDhnFqElo@dpg-d8kht6sm0tmc73cneiig-a.oregon-postgres.render.com/hotel_inventory_db_c4m9',
  ssl: {
    rejectUnauthorized: false
  }
});

// 中間件
app.use(bodyParser.json());
app.use(cors());
app.use(express.static('public'));

// 初始化資料庫
async function initDatabase() {
  try {
    const client = await pool.connect();

    // 建立表格
    const tables = [
      `CREATE TABLE IF NOT EXISTS properties (
        id SERIAL PRIMARY KEY,
        name TEXT UNIQUE NOT NULL,
        group_id INTEGER
      )`,
      `CREATE TABLE IF NOT EXISTS products (
        id SERIAL PRIMARY KEY,
        name TEXT UNIQUE NOT NULL,
        unit_size INTEGER NOT NULL,
        threshold_percent INTEGER DEFAULT 50
      )`,
      `CREATE TABLE IF NOT EXISTS inventory (
        id SERIAL PRIMARY KEY,
        property_id INTEGER NOT NULL REFERENCES properties(id),
        product_id INTEGER NOT NULL REFERENCES products(id),
        quantity INTEGER NOT NULL,
        recorded_date TEXT NOT NULL,
        UNIQUE(property_id, product_id, recorded_date)
      )`,
      `CREATE TABLE IF NOT EXISTS orders (
        id SERIAL PRIMARY KEY,
        order_date TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS order_items (
        id SERIAL PRIMARY KEY,
        order_id INTEGER NOT NULL REFERENCES orders(id),
        property_id INTEGER NOT NULL REFERENCES properties(id),
        product_id INTEGER NOT NULL REFERENCES products(id),
        quantity_needed INTEGER NOT NULL,
        order_boxes INTEGER NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        property_id INTEGER REFERENCES properties(id),
        role TEXT DEFAULT 'staff'
      )`,
      `CREATE TABLE IF NOT EXISTS monthly_quotas (
        id SERIAL PRIMARY KEY,
        product_id INTEGER NOT NULL REFERENCES products(id),
        property_id INTEGER NOT NULL REFERENCES properties(id),
        boxes_per_month INTEGER NOT NULL DEFAULT 5,
        UNIQUE(product_id, property_id)
      )`
    ];

    for (const table of tables) {
      await client.query(table);
    }

    console.log('✅ 資料庫表格建立完成');

    // 種子數據
    await seedData(client);

    client.release();
  } catch (err) {
    console.error('❌ 資料庫初始化失敗:', err);
  }
}

// 種子數據
async function seedData(client) {
  try {
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

    // 插入館別
    for (const prop of properties) {
      await client.query(
        'INSERT INTO properties (name, group_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [prop.name, prop.group]
      );
    }

    // 插入備品
    for (const prod of products) {
      await client.query(
        'INSERT INTO products (name, unit_size, threshold_percent) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
        [prod.name, prod.size, 50]
      );
    }

    // 插入用戶
    for (const user of users) {
      await client.query(
        'INSERT INTO users (username, password, property_id, role) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING',
        [user.username, user.password, user.property_id, user.role]
      );
    }

    // 初始化月度配額
    for (let propId = 1; propId <= 8; propId++) {
      for (let prodId = 1; prodId <= 16; prodId++) {
        await client.query(
          'INSERT INTO monthly_quotas (product_id, property_id, boxes_per_month) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
          [prodId, propId, 5]
        );
      }
    }

    console.log('✅ 資料初始化完成');
  } catch (err) {
    console.error('種子數據錯誤:', err);
  }
}

// ========== API 路由 ==========

// 登入
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const result = await pool.query(
      'SELECT id, username, role, property_id FROM users WHERE username = $1 AND password = $2',
      [username, password]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: '帳號或密碼錯誤' });
    }

    res.json({
      success: true,
      user: result.rows[0]
    });
  } catch (err) {
    res.status(500).json({ error: '資料庫錯誤' });
  }
});

// 獲取所有館別
app.get('/api/properties', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM properties ORDER BY id');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: '資料庫錯誤' });
  }
});

// 獲取所有備品
app.get('/api/products', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM products ORDER BY id');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: '資料庫錯誤' });
  }
});

// 獲取月度配額設定
app.get('/api/monthly-quotas', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT mq.*, pd.name as product_name, pr.name as property_name, pd.unit_size
      FROM monthly_quotas mq
      JOIN products pd ON mq.product_id = pd.id
      JOIN properties pr ON mq.property_id = pr.id
      ORDER BY mq.property_id, mq.product_id
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: '資料庫錯誤' });
  }
});

// 獲取特定館別的月度配額
app.get('/api/monthly-quotas/:propertyId', async (req, res) => {
  const propertyId = req.params.propertyId;
  try {
    const result = await pool.query(`
      SELECT mq.*, pd.name as product_name, pd.unit_size
      FROM monthly_quotas mq
      JOIN products pd ON mq.product_id = pd.id
      WHERE mq.property_id = $1
      ORDER BY mq.product_id
    `, [propertyId]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: '資料庫錯誤' });
  }
});

// 更新月度配額
app.put('/api/monthly-quotas/:id', async (req, res) => {
  const { boxes_per_month } = req.body;
  const id = req.params.id;

  try {
    await pool.query(
      'UPDATE monthly_quotas SET boxes_per_month = $1 WHERE id = $2',
      [boxes_per_month, id]
    );
    res.json({ success: true, message: '更新成功' });
  } catch (err) {
    res.status(500).json({ error: '更新失敗' });
  }
});

// 提交庫存
app.post('/api/inventory/submit', async (req, res) => {
  const { property_id, inventory_data } = req.body;
  const today = new Date().toISOString().split('T')[0];

  try {
    // 插入庫存
    for (const item of inventory_data) {
      const { product_id, quantity } = item;
      await pool.query(
        `INSERT INTO inventory (property_id, product_id, quantity, recorded_date)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (property_id, product_id, recorded_date) DO UPDATE
         SET quantity = $3`,
        [property_id, product_id, quantity, today]
      );
    }

    // 生成叫貨單
    await generateOrder(res, today);
  } catch (err) {
    console.error('提交庫存錯誤:', err);
    res.status(500).json({ error: '提交失敗' });
  }
});

// 生成叫貨單
async function generateOrder(res, today) {
  try {
    const client = await pool.connect();

    // 檢查今天是否已生成過訂單
    const existingOrder = await client.query(
      "SELECT id FROM orders WHERE order_date::date = $1::date",
      [today]
    );

    if (existingOrder.rows.length > 0) {
      client.release();
      return res.json({ success: true, message: '今日已生成訂單' });
    }

    // 獲取今日所有庫存記錄
    const inventoryResult = await client.query(`
      SELECT
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
      WHERE i.recorded_date = $1
      ORDER BY i.property_id, i.product_id
    `, [today]);

    if (inventoryResult.rows.length === 0) {
      client.release();
      return res.json({ success: true, message: '沒有庫存記錄' });
    }

    // 建立訂單
    const orderResult = await client.query(
      'INSERT INTO orders (order_date, status) VALUES ($1, $2) RETURNING id',
      [today, 'pending']
    );

    const orderId = orderResult.rows[0].id;

    // 依據群組合併庫存
    const groupedInventory = {};
    inventoryResult.rows.forEach(row => {
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
      }
      groupedInventory[key].properties.push({
        property_id: row.property_id,
        property_name: row.property_name,
        quantity: row.quantity
      });
      groupedInventory[key].total_quantity += row.quantity;
    });

    // 計算叫貨量
    let itemsProcessed = 0;
    const itemsToProcess = Object.keys(groupedInventory).length;

    for (const [key, item] of Object.entries(groupedInventory)) {
      const firstPropId = item.properties[0].property_id;

      const quotaResult = await client.query(
        'SELECT boxes_per_month FROM monthly_quotas WHERE product_id = $1 AND property_id = $2',
        [item.product_id, firstPropId]
      );

      const quotaBoxes = quotaResult.rows.length > 0 ? quotaResult.rows[0].boxes_per_month : 5;
      const availableBoxes = Math.floor(item.total_quantity / item.unit_size);
      const boxesToOrder = Math.max(0, quotaBoxes - availableBoxes);

      if (boxesToOrder > 0) {
        for (const prop of item.properties) {
          await client.query(
            `INSERT INTO order_items
             (order_id, property_id, product_id, quantity_needed, order_boxes)
             VALUES ($1, $2, $3, $4, $5)`,
            [orderId, prop.property_id, item.product_id, prop.quantity, boxesToOrder]
          );
        }
      }

      itemsProcessed++;
      if (itemsProcessed === itemsToProcess) {
        client.release();
        return res.json({
          success: true,
          message: '庫存已提交，叫貨單已生成',
          order_id: orderId
        });
      }
    }
  } catch (err) {
    console.error('生成叫貨單錯誤:', err);
    res.status(500).json({ error: '生成訂單失敗' });
  }
}

// 獲取最新訂單
app.get('/api/orders/latest', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        o.id, o.order_date, o.status,
        oi.property_id, oi.product_id, oi.quantity_needed, oi.order_boxes,
        pr.name as property_name, pd.name as product_name
      FROM orders o
      LEFT JOIN order_items oi ON o.id = oi.order_id
      LEFT JOIN properties pr ON oi.property_id = pr.id
      LEFT JOIN products pd ON oi.product_id = pd.id
      ORDER BY o.id DESC LIMIT 100
    `);

    // 結構化數據
    const orders = {};
    result.rows.forEach(row => {
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
  } catch (err) {
    res.status(500).json({ error: '資料庫錯誤' });
  }
});

// 獲取庫存歷史
app.get('/api/inventory/:propertyId', async (req, res) => {
  const propertyId = req.params.propertyId;
  try {
    const result = await pool.query(`
      SELECT
        i.product_id, i.quantity, i.recorded_date,
        pd.name as product_name, pd.unit_size
      FROM inventory i
      JOIN products pd ON i.product_id = pd.id
      WHERE i.property_id = $1
      ORDER BY i.recorded_date DESC, i.product_id
    `, [propertyId]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: '資料庫錯誤' });
  }
});

// ===== 品項管理 API =====

// 新增備品
app.post('/api/products', async (req, res) => {
  const { name, unit_size } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO products (name, unit_size, threshold_percent) VALUES ($1, $2, $3) RETURNING *',
      [name, unit_size, 50]
    );
    res.json({ success: true, product: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: '新增備品失敗' });
  }
});

// 更新備品
app.put('/api/products/:id', async (req, res) => {
  const { name, unit_size } = req.body;
  const id = req.params.id;
  try {
    await pool.query(
      'UPDATE products SET name = $1, unit_size = $2 WHERE id = $3',
      [name, unit_size, id]
    );
    res.json({ success: true, message: '更新成功' });
  } catch (err) {
    res.status(500).json({ error: '更新失敗' });
  }
});

// 刪除備品
app.delete('/api/products/:id', async (req, res) => {
  const id = req.params.id;
  try {
    await pool.query('DELETE FROM products WHERE id = $1', [id]);
    res.json({ success: true, message: '刪除成功' });
  } catch (err) {
    res.status(500).json({ error: '刪除失敗' });
  }
});

// ===== 用戶管理 API =====

// 獲取所有用戶
app.get('/api/users', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT u.id, u.username, u.property_id, u.role, pr.name as property_name
      FROM users u
      LEFT JOIN properties pr ON u.property_id = pr.id
      ORDER BY u.id
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: '資料庫錯誤' });
  }
});

// 新增用戶
app.post('/api/users', async (req, res) => {
  const { username, password, property_id, role } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO users (username, password, property_id, role) VALUES ($1, $2, $3, $4) RETURNING id, username, property_id, role',
      [username, password, property_id, role]
    );
    res.json({ success: true, user: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: '新增用戶失敗' });
  }
});

// 更新用戶
app.put('/api/users/:id', async (req, res) => {
  const { username, password, property_id, role } = req.body;
  const id = req.params.id;
  try {
    await pool.query(
      'UPDATE users SET username = $1, password = $2, property_id = $3, role = $4 WHERE id = $5',
      [username, password, property_id, role, id]
    );
    res.json({ success: true, message: '更新成功' });
  } catch (err) {
    res.status(500).json({ error: '更新失敗' });
  }
});

// 刪除用戶
app.delete('/api/users/:id', async (req, res) => {
  const id = req.params.id;
  try {
    await pool.query('DELETE FROM users WHERE id = $1', [id]);
    res.json({ success: true, message: '刪除成功' });
  } catch (err) {
    res.status(500).json({ error: '刪除失敗' });
  }
});

// 啟動伺服器
app.listen(PORT, async () => {
  console.log(`\n🚀 飯店庫存系統已啟動`);
  console.log(`📍 訪問地址: http://localhost:${PORT}`);
  console.log(`\n登入帳號:`);
  console.log(`  👤 管理員: admin / admin123`);
  console.log(`  🏨 各館別: 星美/俞美/中正/福榮/大西/小西/福壽/大東 / pass123`);
  console.log(`\n按 Ctrl+C 停止服務\n`);

  // 初始化資料庫
  await initDatabase();
});

// 優雅關閉
process.on('SIGINT', async () => {
  console.log('\n✅ 伺服器關閉中...');
  await pool.end();
  process.exit(0);
});
