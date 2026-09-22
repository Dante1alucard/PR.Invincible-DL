const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'dev.db');
const db = new sqlite3.Database(dbPath);

// Простые промис-обертки для удобного и чистого кода с async/await
const dbRun = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ id: this.lastID, changes: this.changes });
    });
  });
};

const dbGet = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
};

const dbAll = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
};

// Инициализация таблиц БД
async function initDatabase() {
  // 1. Таблица пользователей
  await dbRun(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      login TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      full_name TEXT NOT NULL,
      phone TEXT NOT NULL,
      email TEXT NOT NULL,
      role TEXT DEFAULT 'user'
    )
  `);

  // 2. Таблица товаров (в стиле Opium / Archive)
  await dbRun(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      price REAL NOT NULL,
      stock INTEGER NOT NULL,
      image TEXT,
      category TEXT
    )
  `);

  // 3. Таблица заказов
  await dbRun(`
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      customer_name TEXT NOT NULL,
      customer_phone TEXT NOT NULL,
      delivery_method TEXT NOT NULL,
      delivery_date TEXT NOT NULL,
      payment_method TEXT NOT NULL,
      promo_code TEXT,
      total_price REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'Новый',
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // 4. Позиции в заказе
  await dbRun(`
    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      price REAL NOT NULL,
      quantity INTEGER NOT NULL,
      FOREIGN KEY (order_id) REFERENCES orders(id),
      FOREIGN KEY (product_id) REFERENCES products(id)
    )
  `);

  // 5. Отзывы (только для покупателей с завершенным заказом)
  await dbRun(`
    CREATE TABLE IF NOT EXISTS reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      user_name TEXT NOT NULL,
      rating INTEGER NOT NULL,
      comment TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (product_id) REFERENCES products(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // 6. Избранное (Wishlist)
  await dbRun(`
    CREATE TABLE IF NOT EXISTS wishlist (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      UNIQUE(user_id, product_id),
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (product_id) REFERENCES products(id)
    )
  `);

  // Создание администратора lab16 / prac3 по ТЗ (Этап 5)
  const admin = await dbGet('SELECT * FROM users WHERE login = ?', ['lab16']);
  if (!admin) {
    await dbRun(`
      INSERT INTO users (login, password, full_name, phone, email, role)
      VALUES (?, ?, ?, ?, ?, ?)
    `, ['lab16', 'prac3', 'Администратор Системы', '8(999)000-00-00', 'admin@opium-archive.store', 'admin']);
    console.log('[DB] Администратор lab16 успешно создан.');
  }

  // Заполнение каталога товарами opium/archive/kai angel, если каталог пуст
  const countRow = await dbGet('SELECT COUNT(*) as count FROM products');
  if (countRow.count === 0) {
    const seedProducts = [
      {
        title: "Archive Heavy Distressed Hoodie 'VIPER'",
        description: 'Оверсайз худи с эффектом состаривания, кислотной вываркой, необработанными краями и массивными металлическими кольцами. Культовый силуэт Kai Angel.',
        price: 8900,
        stock: 15,
        image: '', // Пустая картинка для демонстрации заглушки no_image.jpg по ТЗ
        category: 'Худи'
      },
      {
        title: 'Opium Cobweb Distressed Knit',
        description: 'Черный рваный джемпер с плетением "паутина" и спущенными петлями в стилистике темного ретрофутуризма.',
        price: 7400,
        stock: 8,
        image: '',
        category: 'Свитеры'
      },
      {
        title: 'Waxed Mud-Wash Flared Cargo Pants',
        description: 'Архивные вощеные штаны клеш со сложным кроем коленей, двойными карманами и хромированными заклепками.',
        price: 11900,
        stock: 12,
        image: '',
        category: 'Штаны'
      },
      {
        title: 'Cyber-Goth Asymmetric Leather Jacket',
        description: 'Косуха из плотной зернистой кожи с высоким воротником-стойкой, молниями Raccagni и съемными стропами.',
        price: 24900,
        stock: 5,
        image: '',
        category: 'Куртки'
      },
      {
        title: 'Steel-Spiked Balaclava Beanie',
        description: 'Трансформируемая балаклава из плотного риба с хромированными шипами и вышитым логотипом.',
        price: 3200,
        stock: 20,
        image: '',
        category: 'Аксессуары'
      },
      {
        title: 'Platform Brutal Armor Boots',
        description: 'Массивные ботинки на 7-сантиметровой тракторной платформе со стальными накладками на мыске.',
        price: 17500,
        stock: 7,
        image: '',
        category: 'Обувь'
      }
    ];

    for (const p of seedProducts) {
      await dbRun(
        'INSERT INTO products (title, description, price, stock, image, category) VALUES (?, ?, ?, ?, ?, ?)',
        [p.title, p.description, p.price, p.stock, p.image, p.category]
      );
    }
    console.log('[DB] Стартовые товары Opium/Archive успешно добавлены.');
  }
}

module.exports = {
  db,
  dbRun,
  dbGet,
  dbAll,
  initDatabase
};
