let currentUser = null;
let allProducts = [];
let userWishlist = [];
let currentCategory = 'Все';

document.addEventListener('DOMContentLoaded', async () => {
  await checkAuth();
  await loadProducts();
  await loadCart();
  setupMinDeliveryDate();
});

async function checkAuth() {
  try {
    const res = await fetch('/api/auth/me');
    const data = await res.json();
    currentUser = data.user;
    updateNavAuth();
    if (currentUser) {
      await loadWishlist();
    }
  } catch (err) {
    console.error(err);
  }
}

function updateNavAuth() {
  const profileText = document.getElementById('navProfileText');
  const adminBtn = document.getElementById('navAdminBtn');

  if (currentUser) {
    profileText.textContent = currentUser.full_name.split(' ')[0] || currentUser.login;
    adminBtn.style.display = currentUser.role === 'admin' ? 'inline-flex' : 'none';
  } else {
    profileText.textContent = 'Войти';
    adminBtn.style.display = 'none';
  }
}

function navigateTo(sectionName) {
  document.querySelectorAll('.view-section').forEach(sec => sec.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));

  if (sectionName === 'catalog') {
    document.getElementById('catalogView').classList.add('active');
    document.getElementById('navCatalogBtn').classList.add('active');
  } else if (sectionName === 'wishlist') {
    if (!currentUser) {
      showToast('Авторизуйтесь для доступа к избранному');
      openAuthModal('login');
      return;
    }
    document.getElementById('wishlistView').classList.add('active');
    document.getElementById('navWishlistBtn').classList.add('active');
    renderWishlist();
  } else if (sectionName === 'profile') {
    if (!currentUser) {
      openAuthModal('login');
      return;
    }
    document.getElementById('profileView').classList.add('active');
    document.getElementById('navProfileBtn').classList.add('active');
    loadProfile();
  } else if (sectionName === 'admin') {
    if (!currentUser || currentUser.role !== 'admin') {
      showToast('Доступ только для администратора');
      return;
    }
    document.getElementById('adminView').classList.add('active');
    document.getElementById('navAdminBtn').classList.add('active');
    loadAdminOrders();
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function openProfileOrAuth() {
  if (currentUser) {
    navigateTo('profile');
  } else {
    openAuthModal('login');
  }
}

async function loadProducts() {
  try {
    const res = await fetch('/api/products');
    const data = await res.json();
    allProducts = data.products || [];
    renderProducts();
  } catch (err) {
    console.error(err);
  }
}

function filterCategory(cat) {
  currentCategory = cat;
  document.querySelectorAll('.cat-chip').forEach(chip => {
    if (chip.textContent.trim() === cat) {
      chip.classList.add('active');
    } else {
      chip.classList.remove('active');
    }
  });
  renderProducts();
}

function renderProducts() {
  const grid = document.getElementById('productsGrid');
  grid.innerHTML = '';

  const filtered = currentCategory === 'Все'
    ? allProducts
    : allProducts.filter(p => p.category === currentCategory);

  if (filtered.length === 0) {
    grid.innerHTML = '<div style="grid-column: 1/-1; text-align:center; padding: 40px; color: var(--text-dim);">Товары не найдены</div>';
    return;
  }

  filtered.forEach(p => {
    const imgSrc = p.image ? `/uploads/${p.image}` : '/no_image.jpg';
    const isWished = userWishlist.includes(p.id);

    const card = document.createElement('div');
    card.className = 'product-card';
    card.innerHTML = `
      <div class="card-media-wrap" onclick="openProductModal(${p.id})">
        <img src="${imgSrc}" alt="${p.title}" class="card-img" onerror="this.src='/no_image.jpg'">
        <span class="stock-tag">В наличии: ${p.stock}</span>
        <button class="wish-btn ${isWished ? 'active' : ''}" onclick="toggleWish(event, ${p.id})">
          ${isWished ? '✕' : '+'}
        </button>
      </div>
      <div class="card-body">
        <span class="card-category">${p.category || 'Архив'}</span>
        <h3 class="card-title" onclick="openProductModal(${p.id})">${p.title}</h3>
        <div class="card-rating">
          Рейтинг: ${p.avg_rating || '5.0'} (${p.reviews_count || 0})
        </div>
        <div class="card-bottom">
          <span class="card-price">${Number(p.price).toLocaleString('ru-RU')} ₽</span>
          <button class="btn btn-secondary btn-sm" onclick="addToCart(${p.id})" ${p.stock <= 0 ? 'disabled' : ''}>
            ${p.stock > 0 ? 'В корзину' : 'Нет в наличии'}
          </button>
        </div>
      </div>
    `;
    grid.appendChild(card);
  });
}

async function openProductModal(productId) {
  try {
    const res = await fetch(`/api/products/${productId}`);
    const data = await res.json();
    const p = data.product;
    const reviews = data.reviews || [];
    const canReview = data.canReview;

    const imgSrc = p.image ? `/uploads/${p.image}` : '/no_image.jpg';
    const modalContent = document.getElementById('productModalContent');

    let reviewsHtml = reviews.map(r => `
      <div class="review-card">
        <div class="review-meta">
          <span class="review-user">${r.user_name}</span>
          <div>
            <span>Оценка: ${r.rating}/5</span>
            <span style="margin-left: 8px;">${r.created_at}</span>
          </div>
        </div>
        <p class="review-text">${r.comment}</p>
      </div>
    `).join('');

    if (reviews.length === 0) {
      reviewsHtml = '<p style="color: var(--text-dim); font-size: 13px;">Отзывов пока нет</p>';
    }

    let reviewFormHtml = '';
    if (canReview) {
      reviewFormHtml = `
        <div class="review-form-box">
          <h4 style="font-size: 13px; margin-bottom: 8px;">Оставить отзыв</h4>
          <form onsubmit="submitReview(event, ${p.id})">
            <div class="form-group">
              <label>Оценка</label>
              <select id="reviewRating" style="width: 100px;">
                <option value="5">5 / 5</option>
                <option value="4">4 / 5</option>
                <option value="3">3 / 5</option>
                <option value="2">2 / 5</option>
                <option value="1">1 / 5</option>
              </select>
            </div>
            <div class="form-group">
              <label>Комментарий</label>
              <textarea id="reviewComment" rows="2" required></textarea>
            </div>
            <button type="submit" class="btn btn-primary btn-sm">Отправить</button>
          </form>
        </div>
      `;
    } else {
      reviewFormHtml = `
        <div class="review-restricted-notice">
          Оставить отзыв могут только покупатели с завершенным заказом на данный товар.
        </div>
      `;
    }

    modalContent.innerHTML = `
      <div class="detail-grid">
        <div class="detail-img-wrap">
          <img src="${imgSrc}" alt="${p.title}" class="detail-img" onerror="this.src='/no_image.jpg'">
        </div>
        <div class="detail-info">
          <span class="card-category">${p.category || 'Архив'}</span>
          <h2 style="font-size: 20px; margin-bottom: 8px;">${p.title}</h2>
          <div class="card-rating">Рейтинг: ${p.avg_rating || '5.0'} (${reviews.length} отзывов)</div>
          <p class="detail-desc">${p.description || ''}</p>
          <div class="detail-price">${Number(p.price).toLocaleString('ru-RU')} ₽</div>
          <p class="field-hint" style="margin-bottom: 15px;">Остаток: ${p.stock} шт.</p>
          <button class="btn btn-primary" onclick="addToCart(${p.id})" ${p.stock <= 0 ? 'disabled' : ''}>
            ${p.stock > 0 ? 'Добавить в корзину' : 'Нет в наличии'}
          </button>
        </div>
      </div>

      <div class="reviews-section">
        <div class="reviews-header">
          <h3>Отзывы</h3>
          <span class="strict-badge">Проверенные покупки</span>
        </div>
        <div class="reviews-list">${reviewsHtml}</div>
        ${reviewFormHtml}
      </div>
    `;

    document.getElementById('productModal').classList.add('active');
  } catch (err) {
    console.error(err);
  }
}

function closeProductModal() {
  document.getElementById('productModal').classList.remove('active');
}

async function submitReview(event, productId) {
  event.preventDefault();
  const rating = document.getElementById('reviewRating').value;
  const comment = document.getElementById('reviewComment').value;

  try {
    const res = await fetch(`/api/products/${productId}/reviews`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rating, comment })
    });
    const data = await res.json();
    if (res.ok) {
      showToast('Отзыв опубликован');
      await loadProducts();
      openProductModal(productId);
    } else {
      showToast(data.error || 'Ошибка при отправке');
    }
  } catch (err) {
    console.error(err);
  }
}

async function loadCart() {
  try {
    const res = await fetch('/api/cart');
    const data = await res.json();
    renderCart(data);
  } catch (err) {
    console.error(err);
  }
}

function renderCart(cartData) {
  const badge = document.getElementById('cartBadge');
  badge.textContent = cartData.itemsCount || 0;

  const container = document.getElementById('cartItemsList');
  container.innerHTML = '';

  if (!cartData.items || cartData.items.length === 0) {
    container.innerHTML = '<div style="text-align: center; color: var(--text-dim); padding: 40px 10px;">Корзина пуста</div>';
    document.getElementById('checkoutBtn').disabled = true;
  } else {
    document.getElementById('checkoutBtn').disabled = false;
    cartData.items.forEach(it => {
      const imgSrc = it.image ? `/uploads/${it.image}` : '/no_image.jpg';
      const itemEl = document.createElement('div');
      itemEl.className = 'cart-item';
      itemEl.innerHTML = `
        <img src="${imgSrc}" class="cart-item-img" onerror="this.src='/no_image.jpg'">
        <div class="cart-item-info">
          <div class="cart-item-title">${it.title}</div>
          <div class="cart-item-price">${it.price.toLocaleString('ru-RU')} ₽</div>
        </div>
        <div class="qty-control">
          <button class="qty-btn" onclick="updateQty(${it.productId}, ${it.quantity - 1})">-</button>
          <span class="qty-val">${it.quantity}</span>
          <button class="qty-btn" onclick="updateQty(${it.productId}, ${it.quantity + 1})">+</button>
        </div>
        <button class="del-btn" onclick="removeFromCart(${it.productId})">✕</button>
      `;
      container.appendChild(itemEl);
    });
  }

  document.getElementById('cartSubtotal').textContent = `${cartData.subtotal.toLocaleString('ru-RU')} ₽`;

  const discountRow = document.getElementById('discountRow');
  if (cartData.discountAmount > 0) {
    discountRow.style.display = 'flex';
    document.getElementById('cartDiscount').textContent = `-${cartData.discountAmount.toLocaleString('ru-RU')} ₽ (${cartData.promoDiscount}%)`;
  } else {
    discountRow.style.display = 'none';
  }

  document.getElementById('cartFinalTotal').textContent = `${cartData.finalTotal.toLocaleString('ru-RU')} ₽`;
  document.getElementById('checkoutTotalAmount').textContent = `${cartData.finalTotal.toLocaleString('ru-RU')} ₽`;
}

async function addToCart(productId, qty = 1) {
  try {
    const res = await fetch('/api/cart/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productId, quantity: qty })
    });
    const data = await res.json();
    if (res.ok) {
      showToast('Добавлено в корзину');
      await loadCart();
    } else {
      showToast(data.error || 'Ошибка добавления');
    }
  } catch (err) {
    console.error(err);
  }
}

async function updateQty(productId, newQty) {
  try {
    const res = await fetch('/api/cart/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productId, quantity: newQty })
    });
    const data = await res.json();
    if (res.ok) {
      await loadCart();
    } else {
      showToast(data.error || 'Не удалось обновить');
    }
  } catch (err) {
    console.error(err);
  }
}

async function removeFromCart(productId) {
  try {
    await fetch('/api/cart/remove', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productId })
    });
    await loadCart();
  } catch (err) {
    console.error(err);
  }
}

async function clearCart() {
  try {
    await fetch('/api/cart/clear', { method: 'POST' });
    await loadCart();
  } catch (err) {
    console.error(err);
  }
}

async function applyPromo() {
  const code = document.getElementById('promoInput').value.trim();
  const notice = document.getElementById('promoNotice');
  if (!code) return;

  try {
    const res = await fetch('/api/promo/apply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code })
    });
    const data = await res.json();
    if (res.ok) {
      notice.style.color = 'var(--success)';
      notice.textContent = data.message;
      await loadCart();
    } else {
      notice.style.color = 'var(--danger)';
      notice.textContent = data.error;
    }
  } catch (err) {
    console.error(err);
  }
}

function openCart() {
  document.getElementById('cartDrawer').classList.add('active');
}

function closeCart() {
  document.getElementById('cartDrawer').classList.remove('active');
}

function openCheckout() {
  if (!currentUser) {
    closeCart();
    showToast('Требуется авторизация');
    openAuthModal('login');
    return;
  }

  closeCart();
  document.getElementById('orderName').value = currentUser.full_name || '';
  document.getElementById('orderPhone').value = currentUser.phone || '';
  document.getElementById('checkoutModal').classList.add('active');
}

function closeCheckout() {
  document.getElementById('checkoutModal').classList.remove('active');
}

function setupMinDeliveryDate() {
  const dateInput = document.getElementById('orderDeliveryDate');
  if (dateInput) {
    const today = new Date().toISOString().split('T')[0];
    dateInput.min = today;
    dateInput.value = today;
  }
}

async function submitCheckout(event) {
  event.preventDefault();

  const body = {
    customer_name: document.getElementById('orderName').value,
    customer_phone: document.getElementById('orderPhone').value,
    delivery_method: document.getElementById('orderDeliveryMethod').value,
    delivery_date: document.getElementById('orderDeliveryDate').value,
    payment_method: document.getElementById('orderPaymentMethod').value
  };

  try {
    const res = await fetch('/api/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await res.json();

    if (res.ok) {
      closeCheckout();
      showToast(`Заказ №${data.orderId} оформлен`);
      await loadCart();
      await loadProducts();
      navigateTo('profile');
    } else {
      showToast(data.error || 'Ошибка при оформлении');
    }
  } catch (err) {
    console.error(err);
  }
}

const validationRules = {
  login: {
    regex: /^[a-zA-Z0-9]{6,}$/,
    msg: 'Латинские буквы и цифры, не менее 6 символов'
  },
  password: {
    test: val => val && val.length >= 8,
    msg: 'Минимум 8 символов'
  },
  fullName: {
    regex: /^[А-Яа-яЁё\s]+$/,
    msg: 'Только кириллица и пробелы'
  },
  phone: {
    regex: /^8\(\d{3}\)\d{3}-\d{2}-\d{2}$/,
    msg: 'Формат строго 8(XXX)XXX-XX-XX'
  },
  email: {
    regex: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    msg: 'Корректный email'
  }
};

function validateField(fieldName) {
  let input, errorEl, isValid = false;

  if (fieldName === 'login') {
    input = document.getElementById('regLogin');
    errorEl = document.getElementById('err-regLogin');
    isValid = validationRules.login.regex.test(input.value.trim());
    errorEl.textContent = isValid ? '' : validationRules.login.msg;
  } else if (fieldName === 'password') {
    input = document.getElementById('regPassword');
    errorEl = document.getElementById('err-regPassword');
    isValid = validationRules.password.test(input.value);
    errorEl.textContent = isValid ? '' : validationRules.password.msg;
  } else if (fieldName === 'fullName') {
    input = document.getElementById('regFullName');
    errorEl = document.getElementById('err-regFullName');
    isValid = validationRules.fullName.regex.test(input.value.trim());
    errorEl.textContent = isValid ? '' : validationRules.fullName.msg;
  } else if (fieldName === 'phone') {
    input = document.getElementById('regPhone');
    errorEl = document.getElementById('err-regPhone');
    isValid = validationRules.phone.regex.test(input.value.trim());
    errorEl.textContent = isValid ? '' : validationRules.phone.msg;
  } else if (fieldName === 'email') {
    input = document.getElementById('regEmail');
    errorEl = document.getElementById('err-regEmail');
    isValid = validationRules.email.regex.test(input.value.trim());
    errorEl.textContent = isValid ? '' : validationRules.email.msg;
  }

  if (isValid) {
    input.classList.remove('invalid');
    input.classList.add('valid');
  } else {
    input.classList.remove('valid');
    input.classList.add('invalid');
  }

  return isValid;
}

async function submitRegister(event) {
  event.preventDefault();

  const v1 = validateField('login');
  const v2 = validateField('password');
  const v3 = validateField('fullName');
  const v4 = validateField('phone');
  const v5 = validateField('email');

  if (!v1 || !v2 || !v3 || !v4 || !v5) {
    showToast('Исправьте ошибки в форме');
    return;
  }

  const payload = {
    login: document.getElementById('regLogin').value.trim(),
    password: document.getElementById('regPassword').value,
    full_name: document.getElementById('regFullName').value.trim(),
    phone: document.getElementById('regPhone').value.trim(),
    email: document.getElementById('regEmail').value.trim()
  };

  const errBox = document.getElementById('registerServerErrors');
  errBox.style.display = 'none';

  try {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();

    if (res.ok) {
      currentUser = data.user;
      updateNavAuth();
      closeAuthModal();
      showToast(`Регистрация успешна: ${currentUser.login}`);
    } else {
      errBox.style.display = 'block';
      if (data.errors) {
        const msgs = Object.values(data.errors).map(e => e.msg).join('<br>');
        errBox.innerHTML = msgs;
      } else {
        errBox.textContent = data.error || 'Ошибка регистрации';
      }
    }
  } catch (err) {
    console.error(err);
  }
}

async function submitLogin(event) {
  event.preventDefault();

  const login = document.getElementById('loginUsername').value.trim();
  const password = document.getElementById('loginPassword').value;
  const errBox = document.getElementById('loginError');
  errBox.style.display = 'none';

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ login, password })
    });

    const data = await res.json();

    if (res.ok) {
      currentUser = data.user;
      updateNavAuth();
      closeAuthModal();
      await loadWishlist();
      showToast(`Вы вошли как ${currentUser.login}`);
      if (currentUser.role === 'admin') {
        navigateTo('admin');
      }
    } else {
      errBox.style.display = 'block';
      errBox.textContent = data.error || 'Неверный логин или пароль';
    }
  } catch (err) {
    console.error(err);
  }
}

async function logout() {
  try {
    await fetch('/api/auth/logout', { method: 'POST' });
    currentUser = null;
    userWishlist = [];
    updateNavAuth();
    showToast('Вы вышли из системы');
    navigateTo('catalog');
  } catch (err) {
    console.error(err);
  }
}

function switchAuthTab(tab) {
  document.getElementById('authTabLogin').classList.toggle('active', tab === 'login');
  document.getElementById('authTabRegister').classList.toggle('active', tab === 'register');
  document.getElementById('loginFormContainer').classList.toggle('active', tab === 'login');
  document.getElementById('registerFormContainer').classList.toggle('active', tab === 'register');
}

function openAuthModal(defaultTab = 'login') {
  switchAuthTab(defaultTab);
  document.getElementById('authModal').classList.add('active');
}

function closeAuthModal() {
  document.getElementById('authModal').classList.remove('active');
}

function quickFillAdmin() {
  document.getElementById('loginUsername').value = 'lab16';
  document.getElementById('loginPassword').value = 'prac3';
}

async function loadProfile() {
  if (!currentUser) return;

  document.getElementById('profileInitials').textContent = (currentUser.login || 'US').slice(0, 2).toUpperCase();
  document.getElementById('profileFullName').textContent = currentUser.full_name;
  document.getElementById('profileLogin').textContent = `@${currentUser.login}`;
  document.getElementById('profilePhone').textContent = currentUser.phone;
  document.getElementById('profileEmail').textContent = currentUser.email;
  document.getElementById('profileRole').textContent = currentUser.role === 'admin' ? 'Администратор' : 'Пользователь';

  try {
    const res = await fetch('/api/orders/my');
    const data = await res.json();
    const list = document.getElementById('ordersList');
    list.innerHTML = '';

    if (!data.orders || data.orders.length === 0) {
      list.innerHTML = '<p style="color: var(--text-dim);">У вас пока нет заказов.</p>';
      return;
    }

    data.orders.forEach(o => {
      let statusClass = 'status-new';
      if (o.status === 'В обработке') statusClass = 'status-processing';
      if (o.status === 'Завершено') statusClass = 'status-completed';

      const itemsStr = (o.items || []).map(it => `
        <li>${it.title} — ${it.quantity} шт. × ${it.price.toLocaleString('ru-RU')} ₽</li>
      `).join('');

      const box = document.createElement('div');
      box.className = 'order-box';
      box.innerHTML = `
        <div class="order-header">
          <span class="order-id">Заказ #${o.id}</span>
          <span class="order-status ${statusClass}">${o.status}</span>
        </div>
        <div style="font-size: 11px; color: var(--text-dim); margin-bottom: 8px;">
          ${o.created_at} • ${o.delivery_method} (${o.delivery_date}) • ${o.payment_method}
        </div>
        <ul class="order-items-list">${itemsStr}</ul>
        <div class="order-footer">
          <span>${o.promo_code ? `Промокод: ${o.promo_code}` : 'Без скидки'}</span>
          <span>Итого: ${o.total_price.toLocaleString('ru-RU')} ₽</span>
        </div>
      `;
      list.appendChild(box);
    });
  } catch (err) {
    console.error(err);
  }
}

function switchAdminTab(tab) {
  document.getElementById('tabOrdersBtn').classList.toggle('active', tab === 'orders');
  document.getElementById('tabAddProductBtn').classList.toggle('active', tab === 'add-product');
  document.getElementById('adminOrdersSubView').classList.toggle('active', tab === 'orders');
  document.getElementById('adminProductSubView').classList.toggle('active', tab === 'add-product');
}

async function loadAdminOrders() {
  if (!currentUser || currentUser.role !== 'admin') return;

  const status = document.getElementById('adminStatusFilter').value;
  try {
    const res = await fetch(`/api/admin/orders?status=${encodeURIComponent(status)}`);
    const data = await res.json();
    const container = document.getElementById('adminOrdersList');
    container.innerHTML = '';

    if (!data.orders || data.orders.length === 0) {
      container.innerHTML = '<p style="color: var(--text-dim); padding: 20px;">Заказы не найдены</p>';
      return;
    }

    data.orders.forEach(o => {
      let statusClass = 'status-new';
      if (o.status === 'В обработке') statusClass = 'status-processing';
      if (o.status === 'Завершено') statusClass = 'status-completed';

      const itemsStr = (o.items || []).map(i => `${i.title} (${i.quantity} шт.)`).join(', ');

      const card = document.createElement('div');
      card.className = 'admin-order-card';
      card.innerHTML = `
        <div class="admin-order-top">
          <div class="admin-check-wrap">
            <input type="checkbox" class="order-select-check" value="${o.id}">
            <strong>Заказ #${o.id}</strong> — ${o.customer_name} (${o.customer_phone})
          </div>
          <span class="order-status ${statusClass}">${o.status}</span>
        </div>
        <div style="font-size: 12px; color: var(--text-muted);">
          Состав: ${itemsStr}
        </div>
        <div style="font-size: 11px; color: var(--text-dim);">
          Доставка: ${o.delivery_method} • Дата: ${o.delivery_date} • Оплата: ${o.payment_method} • Сумма: ${o.total_price} ₽
        </div>
        <div style="display: flex; align-items: center; gap: 8px; margin-top: 4px;">
          <label style="font-size: 11px;">Статус:</label>
          <select style="width: 130px; padding: 3px 6px; font-size: 11px;" onchange="updateSingleOrderStatus(${o.id}, this.value)">
            <option value="Новый" ${o.status === 'Новый' ? 'selected' : ''}>Новый</option>
            <option value="В обработке" ${o.status === 'В обработке' ? 'selected' : ''}>В обработке</option>
            <option value="Завершено" ${o.status === 'Завершено' ? 'selected' : ''}>Завершено</option>
          </select>
        </div>
      `;
      container.appendChild(card);
    });
  } catch (err) {
    console.error(err);
  }
}

async function updateSingleOrderStatus(orderId, newStatus) {
  try {
    const res = await fetch(`/api/admin/orders/${orderId}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus })
    });
    if (res.ok) {
      showToast(`Статус заказа #${orderId} изменен`);
      loadAdminOrders();
    }
  } catch (err) {
    console.error(err);
  }
}

async function applyBatchStatus() {
  const checkboxes = document.querySelectorAll('.order-select-check:checked');
  const orderIds = Array.from(checkboxes).map(cb => parseInt(cb.value));
  const newStatus = document.getElementById('adminBatchStatus').value;

  if (orderIds.length === 0) {
    showToast('Выберите заказы');
    return;
  }

  try {
    const res = await fetch('/api/admin/orders/batch-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderIds, status: newStatus })
    });
    if (res.ok) {
      showToast(`Статус обновлен для ${orderIds.length} заказов`);
      loadAdminOrders();
    }
  } catch (err) {
    console.error(err);
  }
}

async function submitNewProduct(event) {
  event.preventDefault();
  const form = document.getElementById('addProductForm');
  const formData = new FormData(form);

  try {
    const res = await fetch('/api/products', {
      method: 'POST',
      body: formData
    });
    const data = await res.json();
    if (res.ok) {
      showToast('Товар сохранен');
      form.reset();
      await loadProducts();
      switchAdminTab('orders');
      navigateTo('catalog');
    } else {
      showToast(data.error || 'Ошибка сохранения');
    }
  } catch (err) {
    console.error(err);
  }
}

async function loadWishlist() {
  if (!currentUser) {
    userWishlist = [];
    document.getElementById('wishlistBadge').textContent = '0';
    return;
  }
  try {
    const res = await fetch('/api/wishlist');
    const data = await res.json();
    userWishlist = (data.wishlist || []).map(p => p.id);
    document.getElementById('wishlistBadge').textContent = userWishlist.length;
  } catch (err) {
    console.error(err);
  }
}

async function toggleWish(event, productId) {
  event.stopPropagation();
  if (!currentUser) {
    showToast('Требуется авторизация');
    openAuthModal('login');
    return;
  }

  try {
    const res = await fetch('/api/wishlist/toggle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productId })
    });
    const data = await res.json();
    if (res.ok) {
      if (data.inWishlist) {
        userWishlist.push(productId);
        showToast('Добавлено в избранное');
      } else {
        userWishlist = userWishlist.filter(id => id !== productId);
        showToast('Удалено из избранного');
      }
      document.getElementById('wishlistBadge').textContent = userWishlist.length;
      renderProducts();
    }
  } catch (err) {
    console.error(err);
  }
}

function renderWishlist() {
  const grid = document.getElementById('wishlistGrid');
  grid.innerHTML = '';

  const wishedItems = allProducts.filter(p => userWishlist.includes(p.id));
  if (wishedItems.length === 0) {
    grid.innerHTML = '<div style="grid-column: 1/-1; text-align:center; padding: 40px; color: var(--text-dim);">Избранное пусто</div>';
    return;
  }

  wishedItems.forEach(p => {
    const imgSrc = p.image ? `/uploads/${p.image}` : '/no_image.jpg';
    const card = document.createElement('div');
    card.className = 'product-card';
    card.innerHTML = `
      <div class="card-media-wrap" onclick="openProductModal(${p.id})">
        <img src="${imgSrc}" alt="${p.title}" class="card-img" onerror="this.src='/no_image.jpg'">
        <button class="wish-btn active" onclick="toggleWish(event, ${p.id})">✕</button>
      </div>
      <div class="card-body">
        <span class="card-category">${p.category || 'Архив'}</span>
        <h3 class="card-title" onclick="openProductModal(${p.id})">${p.title}</h3>
        <div class="card-bottom">
          <span class="card-price">${Number(p.price).toLocaleString('ru-RU')} ₽</span>
          <button class="btn btn-secondary btn-sm" onclick="addToCart(${p.id})">В корзину</button>
        </div>
      </div>
    `;
    grid.appendChild(card);
  });
}

let toastTimer = null;
function showToast(message) {
  const toast = document.getElementById('toastNotification');
  toast.textContent = message;
  toast.style.display = 'block';

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.style.display = 'none';
  }, 2500);
}

function copyCode(code) {
  navigator.clipboard.writeText(code);
  showToast(`Промокод ${code} скопирован`);
  document.getElementById('promoInput').value = code;
}
