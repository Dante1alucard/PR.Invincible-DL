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
  const cat1 = await request({ host: 'localhost', port: 3000, path: '/api/products', method: 'GET' });
  const cat2 = await request({ host: 'localhost', port: 3000, path: '/api/products', method: 'GET' });

  const badReg = await request({
    host: 'localhost', port: 3000, path: '/api/auth/register', method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    login: 'bad',
    password: '123',
    full_name: 'John Doe',
    phone: '89991234567',
    email: 'not-an-email'
  });

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

  const cookie = validReg.headers['set-cookie'] ? validReg.headers['set-cookie'][0].split(';')[0] : '';

  const prodId = cat1.data.products[0].id;
  await request({
    host: 'localhost', port: 3000, path: '/api/cart/add', method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Cookie': cookie }
  }, { productId: prodId, quantity: 2 });

  await request({
    host: 'localhost', port: 3000, path: '/api/promo/apply', method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Cookie': cookie }
  }, { code: 'VIPERR20' });

  const cartRes = await request({
    host: 'localhost', port: 3000, path: '/api/cart', method: 'GET',
    headers: { 'Cookie': cookie }
  });

  const checkoutRes = await request({
    host: 'localhost', port: 3000, path: '/api/checkout', method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Cookie': cookie }
  }, {
    customer_name: 'Кай Ангел Сергеевич',
    customer_phone: '8(999)777-66-55',
    delivery_method: 'Курьер CDEK',
    delivery_date: '2026-09-25',
    payment_method: 'СБП'
  });

  await request({
    host: 'localhost', port: 3000, path: '/api/products/' + prodId + '/reviews', method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Cookie': cookie }
  }, { rating: 5, comment: 'Отличная вещь!' });

  const adminLogin = await request({
    host: 'localhost', port: 3000, path: '/api/auth/login', method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, { login: 'lab16', password: 'prac3' });

  const adminCookie = adminLogin.headers['set-cookie'][0].split(';')[0];

  await request({
    host: 'localhost', port: 3000, path: '/api/admin/orders/' + checkoutRes.data.orderId + '/status', method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Cookie': adminCookie }
  }, { status: 'Завершено' });

  await request({
    host: 'localhost', port: 3000, path: '/api/products/' + prodId + '/reviews', method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Cookie': cookie }
  }, { rating: 5, comment: 'Качество отличное' });

  await request({
    host: 'localhost', port: 3000, path: '/api/wishlist/toggle', method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Cookie': cookie }
  }, { productId: prodId });

  console.log('Tests completed successfully');
}

runTests().catch(console.error);
