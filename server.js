const express = require('express');
const session = require('express-session');
const { body, validationResult } = require('express-validator');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { dbRun, dbGet, dbAll, initDatabase } = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

// Гарантируем наличие папки uploads
const uploadDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Настройка Multer для загрузки картинок товаров (Этап 4)
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    const uniqueName = 'opium-' + Date.now() + '-' + Math.round(Math.random() * 1e4) + ext;
    cb(null, uniqueName);
  }
});
const upload = multer({ storage });

// Middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Сессионные cookies (Этап 1)
app.use(
  session({
    secret: 'opium_archive_secret_key_2026',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 24 // 1 день
    }
  })
);

// Инициализация корзины в сессии
app.use((req, res, next) => {
  if (!req.session.cart) {
    req.session.cart = [];
  }
  next();
});

// Кэширование каталога в памяти (Этап 6)
let catalogCache = {
  data: null,
  timestamp: 0,
  ttl: 60 * 1000 // 60 секунд
};

function invalidateCatalogCache() {
  catalogCache.data = null;
  catalogCache.timestamp = 0;
}

// -------------------------------------------------------------
// ЭТАП 1. АВТОРИЗАЦИЯ, РЕГИСТРАЦИЯ И ВАЛИДАЦИЯ
// -------------------------------------------------------------

// Правила валидации регистрации
const registrationValidationRules = [
  body('login')
    .trim()
    .matches(/^[a-zA-Z0-9]{6,}$/)
    .withMessage('Логин должен состоять только из латинских букв и цифр, длина не менее 6 символов'),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Пароль должен содержать минимум 8 символов'),
  body('full_name')
    .trim()
    .matches(/^[А-Яа-яЁё\s]+$/)
    .withMessage('ФИО должно содержать только символы кириллицы и пробелы'),
  body('phone')
    .trim()
    .matches(/^8\(\d{3}\)\d{3}-\d{2}-\d{2}$/)
    .withMessage('Телефон должен быть строго в формате 8(XXX)XXX-XX-XX'),
  body('email')
    .trim()
    .isEmail()
    .withMessage('Введите корректный адрес электронной почты')
];

// Регистрация
app.post('/api/auth/register', registrationValidationRules, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.mapped() });
  }

  const { login, password, full_name, phone, email } = req.body;

  try {
    const existing = await dbGet('SELECT * FROM users WHERE login = ?', [login]);
    if (existing) {
      return res.status(400).json({
        errors: { login: { msg: 'Пользователь с таким логином уже существует' } }
      });
    }

    const result = await dbRun(
      'INSERT INTO users (login, password, full_name, phone, email, role) VALUES (?, ?, ?, ?, ?, ?)',
      [login, password, full_name, phone, email, 'user']
    );

    req.session.user = {
      id: result.id,
      login,
      full_name,
      phone,
      email,
      role: 'user'
    };

    res.json({ success: true, user: req.session.user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера при регистрации' });
  }
});

// Авторизация (Login)
app.post('/api/auth/login', async (req, res) => {
  const { login, password } = req.body;

  if (!login || !password) {
    return res.status(400).json({ error: 'Заполните логин и пароль' });
  }

  try {
    const user = await dbGet('SELECT * FROM users WHERE login = ? AND password = ?', [login, password]);

    if (!user) {
      return res.status(401).json({ error: 'Неверный логин или пароль' });
    }

    req.session.user = {
      id: user.id,
      login: user.login,
      full_name: user.full_name,
      phone: user.phone,
      email: user.email,
      role: user.role
    };

    res.json({ success: true, user: req.session.user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка при авторизации' });
  }
});

// Выход (Logout)
app.post('/api/auth/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) {
      return res.status(500).json({ error: 'Не удалось завершить сеанс' });
    }
    res.clearCookie('connect.sid');
    res.json({ success: true });
  });
});

// Текущий пользователь
app.get('/api/auth/me', (req, res) => {
  res.json({ user: req.session.user || null });
});

// -------------------------------------------------------------
// ЭТАП 4 & ЭТАП 6. КАТАЛОГ И ТОВАРЫ (С КЭШЕМ И MULTER)
// -------------------------------------------------------------

// Список товаров (кэшируется в памяти по ТЗ Этап 6)
app.get('/api/products', async (req, res) => {
  try {
    const now = Date.now();
    if (catalogCache.data && now - catalogCache.timestamp < catalogCache.ttl) {
      return res.json({ products: catalogCache.data, cached: true });
    }

    const products = await dbAll(`
      SELECT p.*, 
        ROUND(AVG(r.rating), 1) AS avg_rating,
        COUNT(r.id) AS reviews_count
      FROM products p
      LEFT JOIN reviews r ON p.id = r.product_id
      GROUP BY p.id
      ORDER BY p.id DESC
    `);

    catalogCache.data = products;
    catalogCache.timestamp = now;

    res.json({ products, cached: false });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка загрузки каталога' });
  }
});

// Детали товара + отзывы + проверка права на отзыв (Этап 3)
app.get('/api/products/:id', async (req, res) => {
  const productId = req.params.id;
  try {
    const product = await dbGet('SELECT * FROM products WHERE id = ?', [productId]);
    if (!product) {
      return res.status(404).json({ error: 'Товар не найден' });
    }

    const reviews = await dbAll(
      'SELECT * FROM reviews WHERE product_id = ? ORDER BY id DESC',
      [productId]
    );

    // Проверяем, может ли текущий пользователь оставить отзыв (только если есть заказ со статусом "Завершено")
    let canReview = false;
    if (req.session.user) {
      const orderCheck = await dbGet(`
        SELECT o.id FROM orders o
        JOIN order_items oi ON o.id = oi.order_id
        WHERE o.user_id = ? AND o.status = 'Завершено' AND oi.product_id = ?
        LIMIT 1
      `, [req.session.user.id, productId]);

      if (orderCheck) {
        canReview = true;
      }
    }

    res.json({ product, reviews, canReview });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка получения информации о товаре' });
  }
});

// Добавление товара администратором с загрузкой обложки Multer (Этапы 4 и 5)
app.post('/api/products', upload.single('image'), async (req, res) => {
  if (!req.session.user || req.session.user.role !== 'admin') {
    return res.status(403).json({ error: 'Доступ запрещен. Только для администратора.' });
  }

  const { title, description, price, stock, category } = req.body;
  if (!title || !price || stock === undefined) {
    return res.status(400).json({ error: 'Заполните название, цену и остаток' });
  }

  const imageFileName = req.file ? req.file.filename : '';

  try {
    const result = await dbRun(
      'INSERT INTO products (title, description, price, stock, image, category) VALUES (?, ?, ?, ?, ?, ?)',
      [title, description || '', parseFloat(price), parseInt(stock), imageFileName, category || 'Одежда']
    );

    invalidateCatalogCache();
    res.json({ success: true, id: result.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка добавления товара' });
  }
});

// -------------------------------------------------------------
// ЭТАП 2. КОРЗИНА И ОФОРМЛЕНИЕ ЗАКАЗА (CHECKOUT)
// -------------------------------------------------------------

// Получить корзину
app.get('/api/cart', async (req, res) => {
  try {
    const cart = req.session.cart || [];
    const items = [];
    let subtotal = 0;

    for (const item of cart) {
      const product = await dbGet('SELECT * FROM products WHERE id = ?', [item.productId]);
      if (product) {
        const itemTotal = product.price * item.quantity;
        subtotal += itemTotal;
        items.push({
          productId: product.id,
          title: product.title,
          price: product.price,
          stock: product.stock,
          image: product.image,
          quantity: item.quantity,
          total: itemTotal
        });
      }
    }

    const promoDiscount = req.session.promoDiscount || 0;
    const promoCode = req.session.promoCode || null;
    const discountAmount = Math.round((subtotal * promoDiscount) / 100);
    const finalTotal = Math.max(0, subtotal - discountAmount);

    res.json({
      items,
      subtotal,
      promoCode,
      promoDiscount,
      discountAmount,
      finalTotal,
      itemsCount: items.reduce((sum, it) => sum + it.quantity, 0)
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка загрузки корзины' });
  }
});

// Добавить в корзину
app.post('/api/cart/add', async (req, res) => {
  const { productId, quantity = 1 } = req.body;
  const pId = parseInt(productId);
  const qty = Math.max(1, parseInt(quantity));

  try {
    const product = await dbGet('SELECT * FROM products WHERE id = ?', [pId]);
    if (!product) {
      return res.status(404).json({ error: 'Товар не найден' });
    }

    const existingIndex = req.session.cart.findIndex(i => i.productId === pId);
    let newQty = qty;

    if (existingIndex > -1) {
      newQty = req.session.cart[existingIndex].quantity + qty;
      if (newQty > product.stock) {
        return res.status(400).json({ error: `Нельзя добавить больше остатка на складе (${product.stock} шт.)` });
      }
      req.session.cart[existingIndex].quantity = newQty;
    } else {
      if (qty > product.stock) {
        return res.status(400).json({ error: `Нельзя добавить больше остатка на складе (${product.stock} шт.)` });
      }
      req.session.cart.push({ productId: pId, quantity: qty });
    }

    res.json({ success: true, cartCount: req.session.cart.reduce((s, i) => s + i.quantity, 0) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка добавления в корзину' });
  }
});

// Изменить количество в корзине
app.post('/api/cart/update', async (req, res) => {
  const { productId, quantity } = req.body;
  const pId = parseInt(productId);
  const qty = parseInt(quantity);

  try {
    const product = await dbGet('SELECT * FROM products WHERE id = ?', [pId]);
    if (!product) return res.status(404).json({ error: 'Товар не найден' });

    const itemIndex = req.session.cart.findIndex(i => i.productId === pId);
    if (itemIndex === -1) return res.status(404).json({ error: 'Товар в корзине не найден' });

    if (qty <= 0) {
      req.session.cart.splice(itemIndex, 1);
    } else {
      if (qty > product.stock) {
        return res.status(400).json({ error: `Максимально доступно: ${product.stock} шт.` });
      }
      req.session.cart[itemIndex].quantity = qty;
    }

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка обновления корзины' });
  }
});

// Удалить из корзины
app.post('/api/cart/remove', (req, res) => {
  const { productId } = req.body;
  const pId = parseInt(productId);
  req.session.cart = req.session.cart.filter(i => i.productId !== pId);
  res.json({ success: true });
});

// Очистить корзину
app.post('/api/cart/clear', (req, res) => {
  req.session.cart = [];
  req.session.promoCode = null;
  req.session.promoDiscount = 0;
  res.json({ success: true });
});

// Применить промокод (Этап 6)
app.post('/api/promo/apply', (req, res) => {
  const { code } = req.body;
  const promoMap = {
    'OPIUM10': 10,
    'KAIANGEL': 15,
    'VIPER20': 20
  };

  const cleanCode = (code || '').trim().toUpperCase();
  if (promoMap[cleanCode]) {
    req.session.promoCode = cleanCode;
    req.session.promoDiscount = promoMap[cleanCode];
    return res.json({
      success: true,
      code: cleanCode,
      discount: promoMap[cleanCode],
      message: `Промокод применен: скидка ${promoMap[cleanCode]}%`
    });
  }

  res.status(400).json({ error: 'Неверный промокод. Попробуйте OPIUM10, KAIANGEL или VIPER20' });
});

// Оформление заказа (Checkout)
app.post('/api/checkout', async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Для оформления заказа необходимо авторизоваться' });
  }

  const { delivery_method, delivery_date, payment_method, customer_name, customer_phone } = req.body;

  if (!delivery_method || !delivery_date || !payment_method || !customer_name || !customer_phone) {
    return res.status(400).json({ error: 'Пожалуйста, заполните все поля оформления заказа' });
  }

  const cart = req.session.cart || [];
  if (cart.length === 0) {
    return res.status(400).json({ error: 'Корзина пуста' });
  }

  try {
    // 1. Проверяем наличие всех товаров на складе
    let subtotal = 0;
    const itemsToOrder = [];

    for (const item of cart) {
      const product = await dbGet('SELECT * FROM products WHERE id = ?', [item.productId]);
      if (!product) {
        return res.status(400).json({ error: `Товар ID ${item.productId} больше не существует` });
      }
      if (product.stock < item.quantity) {
        return res.status(400).json({
          error: `Недостаточно товара "${product.title}" на складе (остаток: ${product.stock} шт.)`
        });
      }
      subtotal += product.price * item.quantity;
      itemsToOrder.push({ product, quantity: item.quantity });
    }

    // Скидка по промокоду
    const promoDiscount = req.session.promoDiscount || 0;
    const promoCode = req.session.promoCode || null;
    const discountAmount = Math.round((subtotal * promoDiscount) / 100);
    const finalTotal = Math.max(0, subtotal - discountAmount);

    const nowIso = new Date().toLocaleString('ru-RU');

    // 2. Создаем заказ со статусом "Новый" (Этап 2)
    const orderResult = await dbRun(`
      INSERT INTO orders (
        user_id, customer_name, customer_phone, delivery_method, 
        delivery_date, payment_method, promo_code, total_price, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Новый', ?)
    `, [
      req.session.user.id,
      customer_name,
      customer_phone,
      delivery_method,
      delivery_date,
      payment_method,
      promoCode,
      finalTotal,
      nowIso
    ]);

    const orderId = orderResult.id;

    // 3. Атомарно уменьшаем остаток на складе (product.stock) и сохраняем позиции заказа
    for (const item of itemsToOrder) {
      await dbRun(
        'UPDATE products SET stock = stock - ? WHERE id = ?',
        [item.quantity, item.product.id]
      );

      await dbRun(`
        INSERT INTO order_items (order_id, product_id, title, price, quantity)
        VALUES (?, ?, ?, ?, ?)
      `, [orderId, item.product.id, item.product.title, item.product.price, item.quantity]);
    }

    // 4. Очищаем корзину и сбрасываем кэш
    req.session.cart = [];
    req.session.promoCode = null;
    req.session.promoDiscount = 0;
    invalidateCatalogCache();

    res.json({
      success: true,
      orderId,
      message: 'Заказ успешно оформлен со статусом «Новый»'
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка при оформлении заказа' });
  }
});

// -------------------------------------------------------------
// ЭТАП 3. ЛИЧНЫЙ КАБИНЕТ И СТРОГАЯ СИСТЕМА ОТЗЫВОВ
// -------------------------------------------------------------

// История заказов пользователя
app.get('/api/orders/my', async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Требуется авторизация' });
  }

  try {
    const orders = await dbAll(
      'SELECT * FROM orders WHERE user_id = ? ORDER BY id DESC',
      [req.session.user.id]
    );

    for (const order of orders) {
      order.items = await dbAll(
        'SELECT * FROM order_items WHERE order_id = ?',
        [order.id]
      );
    }

    res.json({ orders });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка загрузки истории заказов' });
  }
});

// Добавление отзыва (Строго: только если товар есть в заказе со статусом «Завершено»)
app.post('/api/products/:id/reviews', async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Авторизуйтесь, чтобы оставить отзыв' });
  }

  const productId = parseInt(req.params.id);
  const { rating, comment } = req.body;
  const numRating = parseInt(rating);

  if (!numRating || numRating < 1 || numRating > 5) {
    return res.status(400).json({ error: 'Оценка должна быть от 1 до 5 звезд' });
  }

  if (!comment || comment.trim().length === 0) {
    return res.status(400).json({ error: 'Напишите текст отзыва' });
  }

  try {
    // Строгая проверка по ТЗ: только для покупателей, у которых данный товар есть в заказе со статусом «Завершено»
    const orderCheck = await dbGet(`
      SELECT o.id FROM orders o
      JOIN order_items oi ON o.id = oi.order_id
      WHERE o.user_id = ? AND o.status = 'Завершено' AND oi.product_id = ?
      LIMIT 1
    `, [req.session.user.id, productId]);

    if (!orderCheck) {
      return res.status(403).json({
        error: 'Оставить отзыв могут исключительно покупатели, у которых данный товар есть в заказе со статусом «Завершено»!'
      });
    }

    const nowStr = new Date().toLocaleDateString('ru-RU');

    await dbRun(`
      INSERT INTO reviews (product_id, user_id, user_name, rating, comment, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [productId, req.session.user.id, req.session.user.full_name || req.session.user.login, numRating, comment.trim(), nowStr]);

    invalidateCatalogCache();
    res.json({ success: true, message: 'Отзыв успешно добавлен' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сохранения отзыва' });
  }
});

// -------------------------------------------------------------
// ЭТАП 5. ПАНЕЛЬ АДМИНИСТРАТОРА (lab16 / prac3)
// -------------------------------------------------------------

// Список заказов для админа с фильтрацией по статусам
app.get('/api/admin/orders', async (req, res) => {
  if (!req.session.user || req.session.user.role !== 'admin') {
    return res.status(403).json({ error: 'Доступ разрешен только администратору' });
  }

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

    for (const order of orders) {
      order.items = await dbAll('SELECT * FROM order_items WHERE order_id = ?', [order.id]);
    }

    res.json({ orders });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка получения заказов' });
  }
});

// Одиночное изменение статуса заказа
app.post('/api/admin/orders/:id/status', async (req, res) => {
  if (!req.session.user || req.session.user.role !== 'admin') {
    return res.status(403).json({ error: 'Доступ разрешен только администратору' });
  }

  const orderId = req.params.id;
  const { status } = req.body;

  const validStatuses = ['Новый', 'В обработке', 'Завершено'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: 'Недопустимый статус заказа' });
  }

  try {
    await dbRun('UPDATE orders SET status = ? WHERE id = ?', [status, orderId]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка изменения статуса' });
  }
});

// Массовая смена статуса заказов (Этап 5 ТЗ)
app.post('/api/admin/orders/batch-status', async (req, res) => {
  if (!req.session.user || req.session.user.role !== 'admin') {
    return res.status(403).json({ error: 'Доступ разрешен только администратору' });
  }

  const { orderIds, status } = req.body;

  if (!Array.isArray(orderIds) || orderIds.length === 0) {
    return res.status(400).json({ error: 'Выберите хотя бы один заказ' });
  }

  const validStatuses = ['Новый', 'В обработке', 'Завершено'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: 'Недопустимый статус заказа' });
  }

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

// -------------------------------------------------------------
// ЭТАП 6. ИЗБРАННОЕ (WISHLIST)
// -------------------------------------------------------------

// Получить избранное пользователя
app.get('/api/wishlist', async (req, res) => {
  if (!req.session.user) {
    return res.json({ wishlist: [] });
  }

  try {
    const rows = await dbAll(`
      SELECT p.* FROM wishlist w
      JOIN products p ON w.product_id = p.id
      WHERE w.user_id = ?
    `, [req.session.user.id]);

    res.json({ wishlist: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка загрузки избранного' });
  }
});

// Переключить избранное (добавить/удалить)
app.post('/api/wishlist/toggle', async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Авторизуйтесь, чтобы добавлять в избранное' });
  }

  const { productId } = req.body;
  const pId = parseInt(productId);

  try {
    const existing = await dbGet(
      'SELECT id FROM wishlist WHERE user_id = ? AND product_id = ?',
      [req.session.user.id, pId]
    );

    if (existing) {
      await dbRun('DELETE FROM wishlist WHERE id = ?', [existing.id]);
      return res.json({ success: true, inWishlist: false });
    } else {
      await dbRun('INSERT INTO wishlist (user_id, product_id) VALUES (?, ?)', [req.session.user.id, pId]);
      return res.json({ success: true, inWishlist: true });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка обновления избранного' });
  }
});

// Запуск сервера и инициализация БД
async function startServer() {
  try {
    await initDatabase();
    app.listen(PORT, () => {
      console.log(`[SERVER] Сервер запущен на http://localhost:${PORT}`);
      console.log(`[ADMIN] Доступ в панель администратора: логин lab16, пароль prac3`);
    });
  } catch (err) {
    console.error('Ошибка при запуске сервера:', err);
  }
}

startServer();
