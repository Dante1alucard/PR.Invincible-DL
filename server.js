const express = require('express');
const session = require('express-session');
const { body, validationResult } = require('express-validator');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { dbRun, dbGet, dbAll, initDatabase } = require('./database');
const { sendKladAddress } = require('./bot');

const app = express();
const PORT = process.env.PORT || 3000;

const uploadDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `prod-${Date.now()}-${Math.round(Math.random() * 1e4)}${ext}`);
  }
});
const upload = multer({ storage });

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: 'store_secret_session_key',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, maxAge: 1000 * 60 * 60 * 24 }
}));
app.use((req, res, next) => {
  if (!req.session.cart) req.session.cart = [];
  next();
});

const requireAuth = (req, res, next) => {
  if (!req.session.user) return res.status(401).json({ error: 'Требуется авторизация' });
  next();
};
const requireAdmin = (req, res, next) => {
  if (!req.session.user || req.session.user.role !== 'admin') {
    return res.status(403).json({ error: 'Доступ запрещен' });
  }
  next();
};

const catalogCache = { data: null, timestamp: 0, ttl: 60 * 1000 };
const invalidateCatalogCache = () => {
  catalogCache.data = null;
  catalogCache.timestamp = 0;
};

const VALID_STATUSES = ['Новый', 'В обработке', 'Завершено'];

function parseImages(imgField) {
  if (!imgField) return [];
  try {
    const parsed = JSON.parse(imgField);
    if (Array.isArray(parsed)) return parsed.filter(Boolean);
  } catch (e) {}
  return [imgField].filter(Boolean);
}

async function calculateCart(session) {
  const cart = session.cart || [];
  const items = [];
  let subtotal = 0;

  for (const item of cart) {
    const product = await dbGet('SELECT * FROM products WHERE id = ?', [item.productId]);
    if (product) {
      const imgs = parseImages(product.image);
      const total = product.price * item.quantity;
      subtotal += total;
      items.push({
        productId: product.id,
        title: product.title,
        price: product.price,
        stock: product.stock,
        image: imgs[0] || '',
        images: imgs,
        quantity: item.quantity,
        total
      });
    }
  }

  const promoDiscount = session.promoDiscount || 0;
  const promoCode = session.promoCode || null;
  const discountAmount = Math.round((subtotal * promoDiscount) / 100);
  const finalTotal = Math.max(0, subtotal - discountAmount);

  return {
    items,
    subtotal,
    promoCode,
    promoDiscount,
    discountAmount,
    finalTotal,
    itemsCount: items.reduce((s, it) => s + it.quantity, 0)
  };
}

async function attachOrderItems(orders) {
  for (const o of orders) {
    o.items = await dbAll('SELECT * FROM order_items WHERE order_id = ?', [o.id]);
  }
  return orders;
}

app.get('/product/:id', (req, res, next) => {
  if (!/^\d+$/.test(req.params.id)) {
    return next();
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const registrationRules = [
  body('login').trim().matches(/^[a-zA-Z0-9]{6,}$/).withMessage('Логин должен состоять только из латинских букв и цифр, длина не менее 6 символов'),
  body('password').isLength({ min: 8 }).withMessage('Пароль должен содержать минимум 8 символов'),
  body('full_name').trim().matches(/^[А-Яа-яЁё\s]+$/).withMessage('ФИО должно содержать только символы кириллицы и пробелы'),
  body('phone').trim().matches(/^8\\d{3}\\d{3}\\d{2}\\d{2}$/).withMessage('Телефон должен быть строго в формате 89991234567'),
  body('email').trim().isEmail().withMessage('Введите корректный адрес электронной почты')
];

app.post('/api/auth/register', registrationRules, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.mapped() });

  const { login, password, full_name, phone, email } = req.body;
  try {
    const existing = await dbGet('SELECT * FROM users WHERE login = ?', [login]);
    if (existing) {
      return res.status(400).json({ errors: { login: { msg: 'Пользователь с таким логином уже существует' } } });
    }

    const result = await dbRun(
      'INSERT INTO users (login, password, full_name, phone, email, role) VALUES (?, ?, ?, ?, ?, ?)',
      [login, password, full_name, phone, email, 'user']
    );

    req.session.user = { id: result.id, login, full_name, phone, email, role: 'user' };
    res.json({ success: true, user: req.session.user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { login, password } = req.body;
  if (!login || !password) return res.status(400).json({ error: 'Заполните логин и пароль' });

  try {
    const user = await dbGet('SELECT * FROM users WHERE login = ? AND password = ?', [login, password]);
    if (!user) return res.status(401).json({ error: 'Неверный логин или пароль' });

    const { id, full_name, phone, email, role } = user;
    req.session.user = { id, login: user.login, full_name, phone, email, role };
    res.json({ success: true, user: req.session.user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка при авторизации' });
  }
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) return res.status(500).json({ error: 'Ошибка при выходе' });
    res.clearCookie('connect.sid');
    res.json({ success: true });
  });
});

app.get('/api/auth/me', (req, res) => {
  res.json({ user: req.session.user || null });
});

app.get('/api/products', async (req, res) => {
  try {
    const { sort, min_price, max_price } = req.query;
    const hasFilters = sort || min_price || max_price;

    const now = Date.now();
    if (!hasFilters && catalogCache.data && now - catalogCache.timestamp < catalogCache.ttl) {
      return res.json({ products: catalogCache.data, cached: true });
    }

    const SORT_MAP = {
      price_asc:  'p.price ASC',
      price_desc: 'p.price DESC',
      name_asc:   'p.name ASC',
      name_desc:  'p.name DESC',
    };
    const orderBy = SORT_MAP[sort] || 'p.id DESC';

    const params = [];
    const where = [];
    if (min_price) { where.push('p.price >= ?'); params.push(Number(min_price)); }
    if (max_price) { where.push('p.price <= ?'); params.push(Number(max_price)); }
    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const products = await dbAll(`
      SELECT p.*, 
        ROUND(AVG(r.rating), 1) AS avg_rating,
        COUNT(r.id) AS reviews_count
      FROM products p
      LEFT JOIN reviews r ON p.id = r.product_id
      ${whereClause}
      GROUP BY p.id
      ORDER BY ${orderBy}
    `, params);

    const formatted = products.map(p => {
      const imgs = parseImages(p.image);
      return { ...p, images: imgs, image: imgs[0] || '' };
    });

    if (!hasFilters) { catalogCache.data = formatted; catalogCache.timestamp = now; }
    res.json({ products: formatted, cached: false });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка загрузки каталога' });
  }
});

app.get('/api/products/:id', async (req, res) => {
  const productId = req.params.id;
  try {
    const product = await dbGet('SELECT * FROM products WHERE id = ?', [productId]);
    if (!product) return res.status(404).json({ error: 'Товар не найден' });

    const imgs = parseImages(product.image);
    const formattedProduct = {
      ...product,
      images: imgs,
      image: imgs[0] || ''
    };

    const reviews = await dbAll('SELECT * FROM reviews WHERE product_id = ? ORDER BY id DESC', [productId]);
    let canReview = false;

    if (req.session.user) {
      const orderCheck = await dbGet(`
        SELECT o.id FROM orders o
        JOIN order_items oi ON o.id = oi.order_id
        WHERE o.user_id = ? AND o.status = 'Завершено' AND oi.product_id = ?
        LIMIT 1
      `, [req.session.user.id, productId]);
      canReview = !!orderCheck;
    }

    res.json({ product: formattedProduct, reviews, canReview });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка получения информации о товаре' });
  }
});

app.post('/api/products', requireAdmin, upload.array('images', 5), async (req, res) => {
  const { title, description, price, stock, category, extra_category } = req.body;
  if (!title || !price || stock === undefined) {
    return res.status(400).json({ error: 'Заполните обязательные поля' });
  }

  try {
    const imageFiles = req.files && req.files.length > 0 ? req.files.map(f => f.filename) : [];
    const imageValue = imageFiles.length > 0 ? JSON.stringify(imageFiles) : '';

    const result = await dbRun(
      'INSERT INTO products (title, description, price, stock, image, category, extra_category) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [title, description || '', parseFloat(price), parseInt(stock), imageValue, category || 'Худи+zip', extra_category || '']
    );

    invalidateCatalogCache();
    res.json({ success: true, id: result.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка добавления товара' });
  }
});

app.put('/api/products/:id', requireAdmin, upload.array('images', 5), async (req, res) => {
  const productId = parseInt(req.params.id);
  const { title, description, price, stock, category, extra_category, existing_images } = req.body;

  if (!title || !price || stock === undefined) {
    return res.status(400).json({ error: 'Заполните обязательные поля' });
  }

  try {
    const product = await dbGet('SELECT * FROM products WHERE id = ?', [productId]);
    if (!product) return res.status(404).json({ error: 'Товар не найден' });

    let keptImages = [];
    if (existing_images) {
      try {
        keptImages = JSON.parse(existing_images);
      } catch (e) {
        keptImages = Array.isArray(existing_images) ? existing_images : [existing_images];
      }
    }
    if (!Array.isArray(keptImages)) keptImages = [];

    const newFiles = req.files && req.files.length > 0 ? req.files.map(f => f.filename) : [];
    const allImages = [...keptImages, ...newFiles].slice(0, 5);
    const imageValue = allImages.length > 0 ? JSON.stringify(allImages) : '';

    await dbRun(`
      UPDATE products 
      SET title = ?, description = ?, price = ?, stock = ?, category = ?, extra_category = ?, image = ?
      WHERE id = ?
    `, [
      title,
      description || '',
      parseFloat(price),
      parseInt(stock),
      category || 'Худи+zip',
      extra_category || '',
      imageValue,
      productId
    ]);

    invalidateCatalogCache();
    res.json({ success: true, message: 'Товар обновлен' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка обновления товара' });
  }
});

app.delete('/api/products/:id', requireAdmin, async (req, res) => {
  const productId = parseInt(req.params.id);
  try {
    const product = await dbGet('SELECT * FROM products WHERE id = ?', [productId]);
    if (!product) return res.status(404).json({ error: 'Товар не найден' });

    const imgs = parseImages(product.image);
    imgs.forEach(img => {
      try {
        const filePath = path.join(__dirname, 'public', 'uploads', img);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      } catch (e) {}
    });

    await dbRun('DELETE FROM products WHERE id = ?', [productId]);
    await dbRun('DELETE FROM reviews WHERE product_id = ?', [productId]);
    await dbRun('DELETE FROM wishlist WHERE product_id = ?', [productId]);

    invalidateCatalogCache();
    res.json({ success: true, message: 'Товар успешно удален' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка удаления товара' });
  }
});

app.get('/api/cart', async (req, res) => {
  try {
    const cartSummary = await calculateCart(req.session);
    res.json(cartSummary);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка загрузки корзины' });
  }
});

app.post('/api/cart/add', async (req, res) => {
  const pId = parseInt(req.body.productId);
  const qty = Math.max(1, parseInt(req.body.quantity) || 1);

  try {
    const product = await dbGet('SELECT * FROM products WHERE id = ?', [pId]);
    if (!product) return res.status(404).json({ error: 'Товар не найден' });

    const item = req.session.cart.find(i => i.productId === pId);
    const newQty = item ? item.quantity + qty : qty;

    if (newQty > product.stock) {
      return res.status(400).json({ error: `Остаток на складе: ${product.stock} шт.` });
    }

    if (item) item.quantity = newQty;
    else req.session.cart.push({ productId: pId, quantity: qty });

    res.json({ success: true, cartCount: req.session.cart.reduce((s, i) => s + i.quantity, 0) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка добавления в корзину' });
  }
});

app.post('/api/cart/update', async (req, res) => {
  const pId = parseInt(req.body.productId);
  const qty = parseInt(req.body.quantity);

  try {
    const product = await dbGet('SELECT * FROM products WHERE id = ?', [pId]);
    if (!product) return res.status(404).json({ error: 'Товар не найден' });

    const index = req.session.cart.findIndex(i => i.productId === pId);
    if (index === -1) return res.status(404).json({ error: 'Позиция в корзине не найдена' });

    if (qty <= 0) {
      req.session.cart.splice(index, 1);
    } else {
      if (qty > product.stock) return res.status(400).json({ error: `Доступно только ${product.stock} шт.` });
      req.session.cart[index].quantity = qty;
    }
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка обновления корзины' });
  }
});

app.post('/api/cart/remove', (req, res) => {
  const pId = parseInt(req.body.productId);
  req.session.cart = req.session.cart.filter(i => i.productId !== pId);
  res.json({ success: true });
});

app.post('/api/cart/clear', (req, res) => {
  req.session.cart = [];
  req.session.promoCode = null;
  req.session.promoDiscount = 0;
  res.json({ success: true });
});

app.post('/api/promo/apply', (req, res) => {
  const promoMap = { 'OPIUM10': 10, 'KAIANGEL': 15, 'VIPERR20': 20 };
  const cleanCode = (req.body.code || '').trim().toUpperCase();

  if (promoMap[cleanCode]) {
    req.session.promoCode = cleanCode;
    req.session.promoDiscount = promoMap[cleanCode];
    return res.json({
      success: true,
      code: cleanCode,
      discount: promoMap[cleanCode],
      message: `Скидка ${promoMap[cleanCode]}% применена`
    });
  }
  res.status(400).json({ error: 'Неверный промокод' });
});

app.post('/api/checkout', requireAuth, async (req, res) => {
  const { delivery_method, delivery_date, payment_method, customer_name, customer_phone, klad_type } = req.body;
  if (!delivery_method || !delivery_date || !payment_method || !customer_name || !customer_phone) {
    return res.status(400).json({ error: 'Заполните все поля формы' });
  }

  const cart = req.session.cart || [];
  if (cart.length === 0) return res.status(400).json({ error: 'Корзина пуста' });

  try {
    const summary = await calculateCart(req.session);

    for (const it of summary.items) {
      if (it.stock < it.quantity) {
        return res.status(400).json({ error: `Недостаточно товара "${it.title}" на складе` });
      }
    }

    const isKlad = delivery_method === 'Клад' || (typeof delivery_method === 'string' && delivery_method.startsWith('Клад'));
    const chosenKladType = klad_type || (typeof delivery_method === 'string' && delivery_method.includes('EXTRIMM') ? 'EXTRIMM' : (isKlad ? 'обычная' : null));
    const finalDeliveryMethod = isKlad ? `Клад (${chosenKladType || 'обычная'})` : delivery_method;

    const nowIso = new Date().toLocaleString('ru-RU');
    const orderResult = await dbRun(`
      INSERT INTO orders (
        user_id, customer_name, customer_phone, delivery_method, 
        delivery_date, payment_method, promo_code, total_price, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Новый', ?)
    `, [
      req.session.user.id, customer_name, customer_phone, finalDeliveryMethod,
      delivery_date, payment_method, summary.promoCode, summary.finalTotal, nowIso
    ]);

    const orderId = orderResult.id;
    for (const it of summary.items) {
      await dbRun('UPDATE products SET stock = stock - ? WHERE id = ?', [it.quantity, it.productId]);
      await dbRun(
        'INSERT INTO order_items (order_id, product_id, title, price, quantity) VALUES (?, ?, ?, ?, ?)',
        [orderId, it.productId, it.title, it.price, it.quantity]
      );
    }

    req.session.cart = [];
    req.session.promoCode = null;
    req.session.promoDiscount = 0;
    invalidateCatalogCache();

    let kladInfo = null;
    if (isKlad && customer_phone && customer_phone.startsWith('@')) {
      const tgUsername = customer_phone.slice(1);
      try {
        kladInfo = await sendKladAddress(tgUsername, orderId, summary.items, chosenKladType);
      } catch (err) {
        console.error('[TG BOT] Ошибка отправки адреса клада:', err.message);
      }
    }

    res.json({ success: true, orderId, klad: kladInfo, message: 'Заказ успешно оформлен' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка оформления заказа' });
  }
});

app.get('/api/orders/my', requireAuth, async (req, res) => {
  try {
    const orders = await dbAll('SELECT * FROM orders WHERE user_id = ? ORDER BY id DESC', [req.session.user.id]);
    await attachOrderItems(orders);
    res.json({ orders });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка загрузки истории заказов' });
  }
});

app.post('/api/products/:id/reviews', requireAuth, async (req, res) => {
  const productId = parseInt(req.params.id);
  const rating = parseInt(req.body.rating);
  const comment = (req.body.comment || '').trim();

  if (!rating || rating < 1 || rating > 5) return res.status(400).json({ error: 'Оценка должна быть от 1 до 5' });
  if (!comment) return res.status(400).json({ error: 'Напишите текст отзыва' });

  try {
    const orderCheck = await dbGet(`
      SELECT o.id FROM orders o
      JOIN order_items oi ON o.id = oi.order_id
      WHERE o.user_id = ? AND o.status = 'Завершено' AND oi.product_id = ?
      LIMIT 1
    `, [req.session.user.id, productId]);

    if (!orderCheck) {
      return res.status(403).json({ error: 'Оставить отзыв могут только покупатели с завершенным заказом на этот товар' });
    }

    const nowStr = new Date().toLocaleDateString('ru-RU');
    await dbRun(
      'INSERT INTO reviews (product_id, user_id, user_name, rating, comment, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [productId, req.session.user.id, req.session.user.full_name || req.session.user.login, rating, comment, nowStr]
    );

    invalidateCatalogCache();
    res.json({ success: true, message: 'Отзыв опубликован' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка при сохранении отзыва' });
  }
});

app.get('/api/admin/orders', requireAdmin, async (req, res) => {
  const { status } = req.query;
  try {
    let sql = 'SELECT * FROM orders';
    const params = [];
    if (status && status !== 'Все') {
      sql += ' WHERE status = ?';
      params.push(status);
    }
    sql += ' ORDER BY id DESC';

    const orders = await dbAll(sql, params);
    await attachOrderItems(orders);
    res.json({ orders });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка получения заказов' });
  }
});

app.post('/api/admin/orders/:id/status', requireAdmin, async (req, res) => {
  const { status } = req.body;
  if (!VALID_STATUSES.includes(status)) return res.status(400).json({ error: 'Недопустимый статус' });

  try {
    await dbRun('UPDATE orders SET status = ? WHERE id = ?', [status, req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка изменения статуса' });
  }
});

app.post('/api/admin/orders/batch-status', requireAdmin, async (req, res) => {
  const { orderIds, status } = req.body;
  if (!Array.isArray(orderIds) || orderIds.length === 0) return res.status(400).json({ error: 'Выберите заказы' });
  if (!VALID_STATUSES.includes(status)) return res.status(400).json({ error: 'Недопустимый статус' });

  try {
    for (const id of orderIds) {
      await dbRun('UPDATE orders SET status = ? WHERE id = ?', [status, id]);
    }
    res.json({ success: true, count: orderIds.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка массового изменения статусов' });
  }
});

app.get('/api/wishlist', async (req, res) => {
  if (!req.session.user) return res.json({ wishlist: [] });
  try {
    const rows = await dbAll(`
      SELECT p.* FROM wishlist w
      JOIN products p ON w.product_id = p.id
      WHERE w.user_id = ?
    `, [req.session.user.id]);
    
    const formatted = rows.map(p => {
      const imgs = parseImages(p.image);
      return { ...p, images: imgs, image: imgs[0] || '' };
    });
    res.json({ wishlist: formatted });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка загрузки избранного' });
  }
});

app.post('/api/wishlist/toggle', requireAuth, async (req, res) => {
  const pId = parseInt(req.body.productId);
  try {
    const existing = await dbGet('SELECT id FROM wishlist WHERE user_id = ? AND product_id = ?', [req.session.user.id, pId]);
    if (existing) {
      await dbRun('DELETE FROM wishlist WHERE id = ?', [existing.id]);
      return res.json({ success: true, inWishlist: false });
    }
    await dbRun('INSERT INTO wishlist (user_id, product_id) VALUES (?, ?)', [req.session.user.id, pId]);
    res.json({ success: true, inWishlist: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка обновления избранного' });
  }
});

async function startServer() {
  try {
    await initDatabase();
    app.listen(PORT, () => console.log(`Server started on http://localhost:${PORT}`));
  } catch (err) {
    console.error(err);
  }
}

startServer();
