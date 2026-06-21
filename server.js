const express = require('express');
const { Pool } = require('pg');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 5000;

// PostgreSQL 連接（Neon）
// 優先讀 Render 後台的環境變數 DATABASE_URL，沒設時 fallback 到下面的 Neon 連線字串
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_IMUYTKqQl70t@ep-floral-shadow-ao96t6rz.c-2.ap-southeast-1.aws.neon.tech/neondb?sslmode=require',
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
      )`,
      `CREATE TABLE IF NOT EXISTS property_products (
        id SERIAL PRIMARY KEY,
        property_id INTEGER NOT NULL REFERENCES properties(id),
        product_id INTEGER NOT NULL REFERENCES products(id),
        enabled BOOLEAN DEFAULT true,
        UNIQUE(property_id, product_id)
      )`
    ];

    for (const table of tables) {
      await client.query(table);
    }

    // Schema 遷移：users 表新增 property_ids 陣列，把舊的 property_id 同步進去
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS property_ids INTEGER[] DEFAULT '{}'`);
    await client.query(`
      UPDATE users
      SET property_ids = ARRAY[property_id]
      WHERE property_id IS NOT NULL
        AND (property_ids IS NULL OR array_length(property_ids, 1) IS NULL)
    `);

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
    // 檢查環境變數，如果設定了 RESET_DB=true 則清空舊數據
    const shouldReset = process.env.RESET_DB === 'true';
    if (shouldReset) {
      console.log('🔄 清空舊數據中...');
      await client.query('DELETE FROM property_products');
      await client.query('DELETE FROM order_items');
      await client.query('DELETE FROM monthly_quotas');
      await client.query('DELETE FROM inventory');
      await client.query('DELETE FROM products');
    }

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
      // 牙刷（2種）
      { name: '銀色版-(白色)小美人32孔摩肩斯牙刷+5g', size: 500 },
      { name: '軟膜環保桔梗牙刷+牙膏3g', size: 1000 },
      // 拖鞋（3種）
      { name: '環保拖鞋(BJ-32)', size: 500 },
      { name: 'YL-49(白色)全包不織布紙拖鞋+止滑', size: 300 },
      { name: 'YL70(白色)全包布紙拖鞋+止滑', size: 300 },
      // 面紙（2種）
      { name: 'APP優活太空包面紙 80抽', size: 96 },
      { name: '芙蓉太空包面紙100抽', size: 64 },
      // 捲筒衛生紙（1種）
      { name: 'APP優活小捲衛生紙270節', size: 60 },
      // 垃圾袋（3種）
      { name: '台塑卷取垃圾袋(65*75/大)', size: 1 },
      { name: '連潔塑膠袋(80*95/白)', size: 1 },
      { name: '連潔塑膠袋(40*50/白)', size: 1 },
      // 原有的其他產品
      { name: '綠茶包', size: 100 },
      { name: '烏龍茶包', size: 100 },
      { name: '洋甘菊茶包', size: 280 },
      { name: '咖啡包', size: 100 },
      { name: '奶茶包', size: 100 },
      { name: '條棒', size: 500 },
      { name: '沐浴乳', size: 1 },
      { name: '洗髮精', size: 1 },
      { name: '擦手紙', size: 8 },
      { name: '漂白水', size: 1 }
    ];

    // 上線後僅保留 admin 作為「找不到管理員時的緊急救援」種子。
    // 員工帳號完全由管理員從 UI 自行建立，刪除後不會被自動重建。
    const users = [
      { username: 'admin', password: 'admin123', property_id: null, role: 'admin' }
    ];

    // 插入館別
    for (const prop of properties) {
      await client.query(
        'INSERT INTO properties (name, group_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [prop.name, prop.group]
      );
    }

    // 插入備品（替換舊產品）
    for (const prod of products) {
      await client.query(
        `INSERT INTO products (name, unit_size, threshold_percent) VALUES ($1, $2, $3)
         ON CONFLICT (name) DO UPDATE SET unit_size = $2`,
        [prod.name, prod.size, 50]
      );
    }

    // 刪除不在新列表中的舊產品
    const newProductNames = products.map(p => p.name);
    const oldProds = await client.query('SELECT id, name FROM products');
    for (const oldProd of oldProds.rows) {
      if (!newProductNames.includes(oldProd.name)) {
        console.log(`🗑️ 刪除舊產品: ${oldProd.name}`);
        // 刪除相關記錄後才能刪除產品
        await client.query('DELETE FROM order_items WHERE product_id = $1', [oldProd.id]);
        await client.query('DELETE FROM property_products WHERE product_id = $1', [oldProd.id]);
        await client.query('DELETE FROM monthly_quotas WHERE product_id = $1', [oldProd.id]);
        await client.query('DELETE FROM inventory WHERE product_id = $1', [oldProd.id]);
        await client.query('DELETE FROM products WHERE id = $1', [oldProd.id]);
      }
    }

    // 插入用戶（僅作為「找不到管理員時的緊急救援」，存在則不覆蓋）
    // 上線後，密碼應由管理員從 UI 修改；已存在帳號的密碼不會被這段邏輯重設。
    for (const user of users) {
      const propertyIds = user.property_id ? [user.property_id] : [];
      await client.query(
        'INSERT INTO users (username, password, property_id, property_ids, role) VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING',
        [user.username, user.password, user.property_id, propertyIds, user.role]
      );
    }

    // 獲取所有產品和館別
    const prodsResult = await client.query('SELECT id FROM products ORDER BY id');
    const propsResult = await client.query('SELECT id FROM properties ORDER BY id');
    const productIds = prodsResult.rows.map(r => r.id);
    const propertyIds = propsResult.rows.map(r => r.id);

    console.log(`📦 初始化 ${productIds.length} 個產品 × ${propertyIds.length} 個館別...`);

    // 初始化月度配額和產品啟用狀態
    for (const propId of propertyIds) {
      for (const prodId of productIds) {
        await client.query(
          'INSERT INTO monthly_quotas (product_id, property_id, boxes_per_month) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
          [prodId, propId, 5]
        );
        await client.query(
          'INSERT INTO property_products (property_id, product_id, enabled) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
          [propId, prodId, true]
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
      `SELECT id, username, role, property_id, COALESCE(property_ids, '{}') AS property_ids
       FROM users WHERE username = $1 AND password = $2`,
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

  if (!property_id) {
    return res.status(400).json({ error: '缺少館別' });
  }
  if (!Array.isArray(inventory_data) || inventory_data.length === 0) {
    return res.status(400).json({ error: '沒有庫存資料' });
  }

  try {
    // 插入/更新本次提交的庫存
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

    // 為「該館所屬群組」生成/更新訂單品項
    await generateOrderForGroup(res, today, property_id);
  } catch (err) {
    console.error('提交庫存錯誤:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: '提交失敗' });
    }
  }
});

// 為單一館別（連同同群組的館別）生成或更新今日叫貨單
async function generateOrderForGroup(res, today, submittedPropertyId) {
  const client = await pool.connect();
  try {
    // 取得該館所屬群組（中正+福榮 同群組）
    const groupResult = await client.query(
      'SELECT group_id FROM properties WHERE id = $1',
      [submittedPropertyId]
    );
    if (groupResult.rows.length === 0) {
      return res.status(400).json({ error: '館別不存在' });
    }
    const groupId = groupResult.rows[0].group_id;

    // 取得或建立今日訂單（一天一張，多次提交會累加到同一張）
    let orderId;
    const existingOrder = await client.query(
      'SELECT id FROM orders WHERE order_date = $1',
      [today]
    );
    if (existingOrder.rows.length > 0) {
      orderId = existingOrder.rows[0].id;
    } else {
      const insertResult = await client.query(
        'INSERT INTO orders (order_date, status) VALUES ($1, $2) RETURNING id',
        [today, 'pending']
      );
      orderId = insertResult.rows[0].id;
    }

    // 清掉這張訂單中「同群組館別」的舊品項（重新提交會以最新庫存重算）
    await client.query(
      `DELETE FROM order_items
       WHERE order_id = $1
         AND property_id IN (SELECT id FROM properties WHERE group_id = $2)`,
      [orderId, groupId]
    );

    // 取得今日同群組所有館別的庫存
    const inventoryResult = await client.query(`
      SELECT
        i.property_id, i.product_id, i.quantity,
        pd.unit_size, pr.name AS property_name, pd.name AS product_name, pr.group_id
      FROM inventory i
      JOIN properties pr ON i.property_id = pr.id
      JOIN products pd ON i.product_id = pd.id
      WHERE i.recorded_date = $1 AND pr.group_id = $2
      ORDER BY i.property_id, i.product_id
    `, [today, groupId]);

    if (inventoryResult.rows.length === 0) {
      return res.json({
        success: true,
        message: '庫存已提交，但目前沒有需要叫的品項',
        order_id: orderId
      });
    }

    // 同群組同產品合併計算（中正+福榮 共用配額）
    const merged = {};
    inventoryResult.rows.forEach(row => {
      if (!merged[row.product_id]) {
        merged[row.product_id] = {
          product_id: row.product_id,
          product_name: row.product_name,
          unit_size: row.unit_size,
          properties: [],
          total_quantity: 0
        };
      }
      merged[row.product_id].properties.push({
        property_id: row.property_id,
        property_name: row.property_name,
        quantity: row.quantity
      });
      merged[row.product_id].total_quantity += row.quantity;
    });

    let itemsAdded = 0;
    for (const item of Object.values(merged)) {
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
          itemsAdded++;
        }
      }
    }

    return res.json({
      success: true,
      message: itemsAdded > 0 ? `庫存已提交，本次新增 ${itemsAdded} 筆叫貨品項` : '庫存已提交（庫存充足，無需叫貨）',
      order_id: orderId
    });
  } catch (err) {
    console.error('生成叫貨單錯誤:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: '生成訂單失敗' });
    }
  } finally {
    client.release();
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

// 更新訂單狀態（標記完成 / 重設為待處理）
app.put('/api/orders/:id/status', async (req, res) => {
  const id = parseInt(req.params.id);
  const { status } = req.body;
  if (!['pending', 'completed'].includes(status)) {
    return res.status(400).json({ error: '狀態無效' });
  }
  try {
    await pool.query('UPDATE orders SET status = $1 WHERE id = $2', [status, id]);
    res.json({ success: true });
  } catch (err) {
    console.error('更新訂單狀態錯誤:', err);
    res.status(500).json({ error: '更新失敗' });
  }
});

// 刪除訂單（含所有品項）
app.delete('/api/orders/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM order_items WHERE order_id = $1', [id]);
    await client.query('DELETE FROM orders WHERE id = $1', [id]);
    await client.query('COMMIT');
    res.json({ success: true, message: '訂單已刪除' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('刪除訂單錯誤:', err);
    res.status(500).json({ error: '刪除失敗' });
  } finally {
    client.release();
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
    const client = await pool.connect();
    await client.query('BEGIN');

    // 刪除所有相關的記錄
    await client.query('DELETE FROM order_items WHERE product_id = $1', [id]);
    await client.query('DELETE FROM property_products WHERE product_id = $1', [id]);
    await client.query('DELETE FROM monthly_quotas WHERE product_id = $1', [id]);
    await client.query('DELETE FROM inventory WHERE product_id = $1', [id]);

    // 最後刪除產品
    await client.query('DELETE FROM products WHERE id = $1', [id]);

    await client.query('COMMIT');
    client.release();

    res.json({ success: true, message: '刪除成功' });
  } catch (err) {
    console.error('刪除失敗:', err);
    res.status(500).json({ error: '刪除失敗: ' + err.message });
  }
});

// ===== 用戶管理 API =====

// 獲取所有用戶（含多館別陣列）
app.get('/api/users', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        u.id, u.username, u.role, u.property_id,
        pr.name AS property_name,
        COALESCE(u.property_ids, '{}') AS property_ids,
        (
          SELECT COALESCE(array_agg(p.name ORDER BY p.id), '{}')
          FROM properties p
          WHERE p.id = ANY(COALESCE(u.property_ids, '{}'))
        ) AS property_names
      FROM users u
      LEFT JOIN properties pr ON u.property_id = pr.id
      ORDER BY u.id
    `);
    res.json(result.rows);
  } catch (err) {
    console.error('GET /api/users 錯誤:', err);
    res.status(500).json({ error: '資料庫錯誤' });
  }
});

// 驗證用戶輸入：角色合法、員工必須至少一個館別
function validateUserPayload({ role, property_ids }) {
  if (role !== 'admin' && role !== 'staff') {
    return '角色必須為 admin 或 staff';
  }
  if (role === 'staff') {
    if (!Array.isArray(property_ids) || property_ids.length === 0) {
      return '員工必須至少選擇一個館別';
    }
  }
  return null;
}

// 將前端可能傳入的舊欄位 property_id 轉成陣列；管理員強制清空
function normalizePropertyIds(role, body) {
  if (role !== 'staff') return [];
  if (Array.isArray(body.property_ids)) {
    return body.property_ids.map(Number).filter(n => !isNaN(n));
  }
  if (body.property_id != null) return [Number(body.property_id)];
  return [];
}

// 新增用戶
app.post('/api/users', async (req, res) => {
  const { username, password, role } = req.body;
  const property_ids = normalizePropertyIds(role, req.body);

  const errMsg = validateUserPayload({ role, property_ids });
  if (errMsg) return res.status(400).json({ error: errMsg });

  const primaryPropId = property_ids[0] || null;

  try {
    const result = await pool.query(
      `INSERT INTO users (username, password, property_id, property_ids, role)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, username, property_id, property_ids, role`,
      [username, password, primaryPropId, property_ids, role]
    );
    res.json({ success: true, user: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: '帳號已存在' });
    console.error('POST /api/users 錯誤:', err);
    res.status(500).json({ error: '新增用戶失敗' });
  }
});

// 更新用戶
app.put('/api/users/:id', async (req, res) => {
  const { username, password, role } = req.body;
  const id = parseInt(req.params.id);
  const property_ids = normalizePropertyIds(role, req.body);

  const errMsg = validateUserPayload({ role, property_ids });
  if (errMsg) return res.status(400).json({ error: errMsg });

  const primaryPropId = property_ids[0] || null;

  try {
    await pool.query(
      `UPDATE users
       SET username = $1, password = $2, property_id = $3, property_ids = $4, role = $5
       WHERE id = $6`,
      [username, password, primaryPropId, property_ids, role, id]
    );
    res.json({ success: true, message: '更新成功' });
  } catch (err) {
    console.error('PUT /api/users 錯誤:', err);
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

// 獲取館店的產品啟用狀態
app.get('/api/property-products/:propertyId', async (req, res) => {
  const propertyId = req.params.propertyId;
  try {
    const result = await pool.query(`
      SELECT pp.id, pp.product_id, pp.enabled, p.name as product_name, p.unit_size
      FROM property_products pp
      JOIN products p ON pp.product_id = p.id
      WHERE pp.property_id = $1
      ORDER BY p.id
    `, [propertyId]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: '資料庫錯誤' });
  }
});

// 更新館店的產品啟用狀態
app.put('/api/property-products/:propertyId/:productId', async (req, res) => {
  const { propertyId, productId } = req.params;
  const { enabled } = req.body;
  try {
    await pool.query(
      'UPDATE property_products SET enabled = $1 WHERE property_id = $2 AND product_id = $3',
      [enabled, propertyId, productId]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: '更新失敗' });
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
