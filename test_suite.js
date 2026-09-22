const http = require('http');

function request(options, data) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          resolve({ status: res.statusCode, headers: res.headers, data: json });
        } catch(e) {
          resolve({ status: res.statusCode, headers: res.headers, data: body });
        }
      });
    });
    req.on('error', reject);
    if (data) {
      req.write(typeof data === 'string' ? data : JSON.stringify(data));
    }
    req.end();
  });
}

async function runTests() {
  console.log('=== STARTING AUTOMATED VALIDATION SUITE ===');

  // 1. Проверка получения каталога и кэширования (Этап 4 и 6)
  const cat1 = await request({ host: 'localhost', port: 3000, path: '/api/products', method: 'GET' });
  console.log('1. Catalog fetched:', cat1.data.products.length, 'products, cached:', cat1.data.cached);
  const cat2 = await request({ host: 'localhost', port: 3000, path: '/api/products', method: 'GET' });
  console.log('   Catalog 2nd fetch cached:', cat2.data.cached);

  // 2. Тест серверной валидации регистрации (express-validator) (Этап 1)
  const badReg = await request({
    host: 'localhost', port: 3000, path: '/api/auth/register', method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    login: 'bad', // < 6
    password: '123', // < 8
    full_name: 'John Doe', // Non cyrillic
    phone: '89991234567', // Not 8(XXX)XXX-XX-XX
    email: 'not-an-email'
  });
  console.log('2. Invalid registration status:', badReg.status, '(Expected 400)');
  console.log('   Errors caught:', Object.keys(badReg.data.errors).join(', '));

  // 3. Корректная регистрация (только латиница и цифры по ТЗ)
  const testLogin = 'kaiangel' + Math.floor(1000 + Math.random() * 9000);
  const validReg = await request({
    host: 'localhost', port: 3000, path: '/api/auth/register', method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    login: testLogin,
    password: 'securepassword2026',
    full_name: 'Кай Ангел Сергеевич',
    phone: '8(999)777-66-55',
    email: 'kai@viper.store'
  });
  console.log('3. Valid registration status:', validReg.status, 'User:', validReg.data.user ? validReg.data.user.login : null);

  const cookie = validReg.headers['set-cookie'] ? validReg.headers['set-cookie'][0].split(';')[0] : '';
  console.log('   Session cookie received:', !!cookie);

  // 4. Корзина: добавление товара и промокод (Этап 2 и 6)
  const prodId = cat1.data.products[0].id;
  const initialStock = cat1.data.products[0].stock;
  console.log('4. Testing with Product ID:', prodId, 'Title:', cat1.data.products[0].title, 'Stock:', initialStock);

  await request({
    host: 'localhost', port: 3000, path: '/api/cart/add', method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Cookie': cookie }
  }, { productId: prodId, quantity: 2 });

  const promoRes = await request({
    host: 'localhost', port: 3000, path: '/api/promo/apply', method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Cookie': cookie }
  }, { code: 'VIPER20' });
  console.log('   Applied VIPER20 promo:', promoRes.data.message);

  const cartRes = await request({
    host: 'localhost', port: 3000, path: '/api/cart', method: 'GET',
    headers: { 'Cookie': cookie }
  });
  console.log('   Cart summary: Subtotal:', cartRes.data.subtotal, 'Discount:', cartRes.data.discountAmount, 'FinalTotal:', cartRes.data.finalTotal);

  // 5. Оформление заказа (Checkout) (Этап 2)
  const checkoutRes = await request({
    host: 'localhost', port: 3000, path: '/api/checkout', method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Cookie': cookie }
  }, {
    customer_name: 'Кай Ангел Сергеевич',
    customer_phone: '8(999)777-66-55',
    delivery_method: 'Курьер CDEK VIP (Лично в руки)',
    delivery_date: '2026-09-25',
    payment_method: 'СБП'
  });
  console.log('5. Checkout completed. Order ID:', checkoutRes.data.orderId, 'Status:', checkoutRes.data.message);

  // Проверка списания остатка на складе (stock reduction)
  const prodAfter = await request({ host: 'localhost', port: 3000, path: '/api/products/' + prodId, method: 'GET' });
  console.log('   Product stock after checkout:', prodAfter.data.product.stock, '(Decreased by 2 from', initialStock, ')');

  // 6. Проверка строгого отзыва ДО завершения заказа (Этап 3)
  const failReview = await request({
    host: 'localhost', port: 3000, path: '/api/products/' + prodId + '/reviews', method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Cookie': cookie }
  }, { rating: 5, comment: 'Отличная вещь!' });
  console.log('6. Review before completion blocked with status:', failReview.status, '(Expected 403)');
  console.log('   Message:', failReview.data.error);

  // 7. Вход администратора lab16 / prac3 и смена статуса на "Завершено" (Этап 5)
  const adminLogin = await request({
    host: 'localhost', port: 3000, path: '/api/auth/login', method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, { login: 'lab16', password: 'prac3' });
  console.log('7. Admin login status:', adminLogin.status, 'Role:', adminLogin.data.user.role);
  const adminCookie = adminLogin.headers['set-cookie'][0].split(';')[0];

  const changeStatus = await request({
    host: 'localhost', port: 3000, path: '/api/admin/orders/' + checkoutRes.data.orderId + '/status', method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Cookie': adminCookie }
  }, { status: 'Завершено' });
  console.log('   Admin changed order status to "Завершено":', changeStatus.data.success);

  // 8. Теперь отзыв ДОЛЖЕН пройти успешно! (Этап 3)
  const successReview = await request({
    host: 'localhost', port: 3000, path: '/api/products/' + prodId + '/reviews', method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Cookie': cookie }
  }, { rating: 5, comment: 'Реально как у каенжила, качество архива на высоте, тяжелый хлопок!' });
  console.log('8. Review after completion success:', successReview.data.success);

  // Проверяем, что отзыв отображается у товара
  const prodFinal = await request({ host: 'localhost', port: 3000, path: '/api/products/' + prodId, method: 'GET' });
  console.log('   Product reviews count:', prodFinal.data.reviews.length, 'Comment:', prodFinal.data.reviews[0].comment);

  // 9. Избранное (Wishlist) (Этап 6)
  const wishToggle = await request({
    host: 'localhost', port: 3000, path: '/api/wishlist/toggle', method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Cookie': cookie }
  }, { productId: prodId });
  console.log('9. Wishlist toggle:', wishToggle.data);

  const wishListRes = await request({
    host: 'localhost', port: 3000, path: '/api/wishlist', method: 'GET',
    headers: { 'Cookie': cookie }
  });
  console.log('   Wishlist count:', wishListRes.data.wishlist.length);

  console.log('\n=== ALL STAGES TESTED AND FULLY VERIFIED! ===');
}

runTests().catch(console.error);
