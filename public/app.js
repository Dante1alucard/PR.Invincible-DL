let currentUser = null;
let allProducts = [];
let userWishlist = [];
let currentCategory = 'Все';
let toastTimer = null;

const $ = id => document.getElementById(id);
const $$ = sel => document.querySelectorAll(sel);
const STATUS_CLASSES = { 'Новый': 'status-new', 'В обработке': 'status-processing', 'Завершено': 'status-completed' };

function escapeJs(str) {
  if (!str) return '';
  return String(str).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;');
}

async function api(url, method = 'GET', body = null) {
  try {
    const opts = { method, headers: {} };
    if (body) {
      if (body instanceof FormData) opts.body = body;
      else {
        opts.headers['Content-Type'] = 'application/json';
        opts.body = JSON.stringify(body);
      }
    }
    const res = await fetch(url, opts);
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    console.error(err);
    return { ok: false, data: { error: 'Сетевая ошибка' } };
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  await checkAuth();
  await loadProducts()
  await loadCart();
  setupMinDeliveryDate();
  initPhotoDragAndDrop();
  initCategoryBarScroll();

  if (!checkInitialRoute()) {
    navigateTo('catalog', false);
  }
});

function checkInitialRoute() {
  const match = window.location.pathname.match(/\/product\/(\d+)/) || window.location.hash.match(/#product-(\d+)/);
  if (match) {
    openProductPage(parseInt(match[1]), false);
    return true;
  }
  return false;
}

window.addEventListener('popstate', (e) => {
  if (e.state && e.state.productId) {
    openProductPage(e.state.productId, false);
  } else {
    const match = window.location.pathname.match(/\/product\/(\d+)/);
    if (match) {
      openProductPage(parseInt(match[1]), false);
    } else {
      navigateTo('catalog', false);
    }
  }
});

async function checkAuth() {
  const { ok, data } = await api('/api/auth/me');
  if (ok) {
    currentUser = data.user;
    updateNavAuth();
    if (currentUser) await loadWishlist();
  }
}

function updateNavAuth() {
  $('navProfileText').textContent = currentUser ? currentUser.login.toUpperCase() : 'LOGIN';
  $('navAdminBtn').style.display = (currentUser && currentUser.role === 'admin') ? 'inline-flex' : 'none';
}

function scrollToDrops() {
  if (!$('catalogView').classList.contains('active')) {
    navigateTo('catalog');
  }
  const target = document.querySelector('.category-bar') || document.querySelector('.hero-banner');
  if (target) {
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    target.classList.add('drops-highlight-pulse');
    setTimeout(() => target.classList.remove('drops-highlight-pulse'), 1400);
  }
}

function navigateTo(section, push = true) {
  if (push && window.location.pathname !== '/') {
    history.pushState({}, '', '/');
  }

  $$('.view-section').forEach(sec => sec.classList.remove('active'));
  $$('.nav-btn').forEach(btn => btn.classList.remove('active'));

  if (section === 'catalog') {
    $('catalogView').classList.add('active');
    $('navCatalogBtn').classList.add('active');
    renderHeroSpotlight();
  } else if (section === 'wishlist') {
    if (!currentUser) return (showToast('Авторизуйтесь для доступа к избранному'), openAuthModal('login'));
    $('wishlistView').classList.add('active');
    $('navWishlistBtn').classList.add('active');
    renderWishlist();
  } else if (section === 'profile') {
    if (!currentUser) return openAuthModal('login');
    $('profileView').classList.add('active');
    $('navProfileBtn').classList.add('active');
    loadProfile();
  } else if (section === 'admin') {
    if (!currentUser || currentUser.role !== 'admin') return showToast('Доступ только для администратора');
    $('adminView').classList.add('active');
    $('navAdminBtn').classList.add('active');
    switchAdminTab('catalog-mgmt');
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function openProfileOrAuth() {
  currentUser ? navigateTo('profile') : openAuthModal('login');
}

async function loadProducts() {
  const { ok, data } = await api('/api/products');
  if (ok) {
    allProducts = data.products || [];
    renderProducts();
    renderHeroSpotlight();
  }
}

function renderHeroSpotlight() {
  const container = $('heroSpotlightCard');
  if (!container) return;

  if (!allProducts || allProducts.length === 0) {
    container.style.display = 'none';
    return;
  }

  const kaiangelPool = allProducts.filter(p => {
    const cat = (p.category || '').toLowerCase();
    const extra = (p.extra_category || '').toLowerCase();
    const title = (p.title || '').toLowerCase();
    return cat.includes('каенжил') || extra.includes('каенжил') || cat.includes('kaiangel') || extra.includes('kaiangel') || title.includes('каенжил') || title.includes('kaiangel');
  });

  const pool = kaiangelPool.length > 0 ? kaiangelPool : allProducts;
  const p = pool[Math.floor(Math.random() * pool.length)];
  if (!p) {
    container.style.display = 'none';
    return;
  }

  container.style.display = 'flex';
  const images = (p.images && p.images.length > 0) ? p.images : (p.image ? [p.image] : []);
  const imgSrc = images[0] ? `/uploads/${images[0]}` : '/assets/images/no_image.jpg';
  const isWished = userWishlist.includes(p.id);

  container.innerHTML = `
    <div class="spotlight-header">
      <span class="spotlight-badge">✦ ПОПУЛЯРНО СЕЙЧАС</span>
      <span class="spotlight-cat-tag">КАК У КАЕНЖИЛА</span>
    </div>
    <div class="spotlight-body" onclick="openProductPage(${p.id})">
      <div class="spotlight-img-wrap">
        <img src="${imgSrc}" alt="${escapeJs(p.title)}" class="spotlight-img" onerror="this.src='/assets/images/no_image.jpg'">
        <span class="spotlight-stock">${p.stock > 0 ? `В наличии: ${p.stock}` : 'Под заказ'}</span>
        <button class="wish-btn ${isWished ? 'active' : ''}" onclick="toggleWish(event, ${p.id})" title="В избранное">
          ${isWished ? '✕' : '+'}
        </button>
      </div>
      <div class="spotlight-info">
        <div class="spotlight-title">${p.title}</div>
        <div class="spotlight-bottom">
          <span class="spotlight-price">${Number(p.price).toLocaleString('ru-RU')} ₽</span>
          <button class="btn btn-secondary btn-sm spotlight-buy-btn" onclick="event.stopPropagation(); addToCart(${p.id})" ${p.stock <= 0 ? 'disabled' : ''}>
            ${p.stock > 0 ? 'В корзину' : 'Нет в наличии'}
          </button>
        </div>
      </div>
    </div>
  `;
}

function filterCategory(cat) {
  currentCategory = cat;
  $$('.cat-chip').forEach(chip => chip.classList.toggle('active', chip.textContent.trim() === cat));
  renderProducts();
}

function initCategoryBarScroll() {
  const catBar = document.querySelector('.category-bar');
  if (!catBar) return;

  catBar.addEventListener('wheel', (e) => {
    if (e.deltaY !== 0) {
      e.preventDefault();
      catBar.scrollLeft += e.deltaY * 0.9;
    }
  }, { passive: false });

  let isDown = false;
  let startX;
  let scrollLeft;

  catBar.addEventListener('mousedown', (e) => {
    isDown = true;
    startX = e.pageX - catBar.offsetLeft;
    scrollLeft = catBar.scrollLeft;
  });

  window.addEventListener('mouseup', () => {
    isDown = false;
  });

  catBar.addEventListener('mousemove', (e) => {
    if (!isDown) return;
    e.preventDefault();
    const x = e.pageX - catBar.offsetLeft;
    const walk = (x - startX) * 1.5;
    catBar.scrollLeft = scrollLeft - walk;
  });
}

function renderProducts() {
  const grid = $('productsGrid');
  grid.innerHTML = '';

  const filtered = currentCategory === 'Все'
    ? allProducts
    : allProducts.filter(p => p.category === currentCategory || p.extra_category === currentCategory);

  if (filtered.length === 0) {
    grid.innerHTML = '<div style="grid-column: 1/-1; text-align:center; padding: 40px; color: var(--text-dim); font-size: 18px;">Товары не найдены</div>';
    return;
  }

  filtered.forEach(p => {
    const images = (p.images && p.images.length > 0) ? p.images : (p.image ? [p.image] : []);
    const imgSrc = images[0] ? `/uploads/${images[0]}` : '/assets/images/no_image.jpg';
    const isWished = userWishlist.includes(p.id);
    const photoCountBadge = images.length > 1 ? `<span class="photo-count-tag">📷 ${images.length}</span>` : '';
    const catHtml = p.extra_category
      ? `<span class="card-category">${p.category || 'Одежда'} • <span class="extra-cat-tag">${p.extra_category}</span></span>`
      : `<span class="card-category">${p.category || 'Одежда'}</span>`;

    const adminActionsHtml = (currentUser && currentUser.role === 'admin') ? `
      <div class="admin-card-actions">
        <button class="btn btn-admin-edit" onclick="event.stopPropagation(); openEditProductModal(${p.id})">✎ Редактировать</button>
        <button class="btn btn-admin-delete" onclick="event.stopPropagation(); deleteProduct(${p.id}, '${escapeJs(p.title)}')">✕ Удалить</button>
      </div>
    ` : '';

    const card = document.createElement('div');
    card.className = 'product-card';
    card.innerHTML = `
      <div class="card-media-wrap" onclick="openProductPage(${p.id})">
        <img src="${imgSrc}" alt="${p.title}" class="card-img" onerror="this.src='/assets/images/no_image.jpg'">
        <span class="stock-tag">В наличии: ${p.stock}</span>
        ${photoCountBadge}
        <button class="wish-btn ${isWished ? 'active' : ''}" onclick="toggleWish(event, ${p.id})">
          ${isWished ? '✕' : '+'}
        </button>
      </div>
      <div class="card-body">
        ${catHtml}
        <h3 class="card-title" onclick="openProductPage(${p.id})">${p.title}</h3>
        <div class="card-rating">Рейтинг: ${p.avg_rating || '5.0'} (${p.reviews_count || 0})</div>
        <div class="card-bottom">
          <span class="card-price">${Number(p.price).toLocaleString('ru-RU')} ₽</span>
          <button class="btn btn-secondary btn-sm" onclick="addToCart(${p.id})" ${p.stock <= 0 ? 'disabled' : ''}>
            ${p.stock > 0 ? 'В корзину' : 'Нет в наличии'}
          </button>
        </div>
        ${adminActionsHtml}
      </div>
    `;
    grid.appendChild(card);
  });
}

async function openProductPage(productId, push = true) {
  if (push) {
    history.pushState({ productId }, '', `/product/${productId}`);
  }

  $$('.view-section').forEach(sec => sec.classList.remove('active'));
  $$('.nav-btn').forEach(btn => btn.classList.remove('active'));
  $('productView').classList.add('active');
  window.scrollTo({ top: 0, behavior: 'smooth' });

  const { ok, data } = await api(`/api/products/${productId}`);
  if (!ok || !data.product) {
    $('productPageContent').innerHTML = '<div style="padding: 40px; text-align: center; color: var(--text-dim); font-size: 18px;">Товар не найден</div>';
    return;
  }

  const { product: p, reviews = [], canReview } = data;
  const images = (p.images && p.images.length > 0) ? p.images : (p.image ? [p.image] : []);
  const mainImageSrc = images.length > 0 ? `/uploads/${images[0]}` : '/assets/images/no_image.jpg';

  $('breadcrumbCategory').textContent = p.category || 'Одежда';
  $('breadcrumbCategory').onclick = () => {
    navigateTo('catalog');
    filterCategory(p.category || 'Все');
  };
  $('breadcrumbTitle').textContent = p.title;

  const thumbsHtml = images.length > 1 ? `
    <div class="gallery-thumbs">
      ${images.map((img, idx) => `
        <button type="button" class="thumb-btn ${idx === 0 ? 'active' : ''}" onclick="switchProductGalleryImage('/uploads/${img}', this)">
          <img src="/uploads/${img}" alt="Фото ${idx + 1}" onerror="this.src='/assets/images/no_image.jpg'">
        </button>
      `).join('')}
    </div>
  ` : '';

  const reviewsHtml = reviews.length === 0
    ? '<p style="color: var(--text-dim); font-size: 15px;">Отзывов пока нет. Будьте первым, кто оценит этот айтем!</p>'
    : reviews.map(r => `
      <div class="review-card">
        <div class="review-meta">
          <span class="review-user">${r.user_name}</span>
          <div>
            <span>★ ${r.rating} / 5</span>
            <span style="margin-left: 10px; color: var(--text-dim);">${r.created_at}</span>
          </div>
        </div>
        <p class="review-text">${r.comment}</p>
      </div>
    `).join('');

  const reviewFormHtml = canReview ? `
    <div class="review-form-box">
      <h4 style="font-size: 16px; margin-bottom: 12px; font-weight: 700;">Оставить отзыв о товаре</h4>
      <form onsubmit="submitReview(event, ${p.id})">
        <div class="form-group">
          <label>Оценка качества</label>
          <select id="reviewRating" style="width: 140px;">
            <option value="5">★★★★★ (5 / 5)</option>
            <option value="4">★★★★☆ (4 / 5)</option>
            <option value="3">★★★☆☆ (3 / 5)</option>
            <option value="2">★★☆☆☆ (2 / 5)</option>
            <option value="1">★☆☆☆☆ (1 / 5)</option>
          </select>
        </div>
        <div class="form-group">
          <label>Ваш отзыв</label>
          <textarea id="reviewComment" rows="3" placeholder="Расскажите о посадке, материале и качестве изделия..." required></textarea>
        </div>
        <button type="submit" class="btn btn-primary">Опубликовать отзыв</button>
      </form>
    </div>` : `
    <div class="review-restricted-notice">
      Оставить отзыв могут только покупатели с завершенным заказом на данный айтем.
    </div>`;

  const isWished = userWishlist.includes(p.id);

  const adminBannerHtml = (currentUser && currentUser.role === 'admin') ? `
    <div class="admin-product-banner">
      <div><strong> [GOD MODE]</strong> Управление товаром #${p.id}</div>
      <div style="display: flex; gap: 8px;">
        <button class="btn btn-sm btn-admin-edit" onclick="openEditProductModal(${p.id})">✎ Редактировать</button>
        <button class="btn btn-sm btn-admin-delete" onclick="deleteProduct(${p.id}, '${escapeJs(p.title)}')">✕ Удалить</button>
      </div>
    </div>
  ` : '';

  $('productPageContent').innerHTML = `
    <div class="product-gallery">
      <div class="gallery-main-wrap">
        <img id="mainProductImg" src="${mainImageSrc}" alt="${p.title}" class="gallery-main-img" onerror="this.src='/assets/images/no_image.jpg'">
      </div>
      ${thumbsHtml}
    </div>

    <div class="product-details-col">
      ${adminBannerHtml}
      <div class="product-details-category">
        ${p.category || 'Одежда'}
        ${p.extra_category ? `<span class="extra-badge">${p.extra_category}</span>` : ''}
      </div>
      <h1 class="product-details-title">${p.title}</h1>
      <div class="product-details-rating">
        <span>★ ${p.avg_rating || '5.0'}</span>
        <span>•</span>
        <span>${reviews.length} ${getNoun(reviews.length, 'отзыв', 'отзыва', 'отзывов')}</span>
      </div>

      <div class="product-details-price">${Number(p.price).toLocaleString('ru-RU')} ₽</div>

      <div class="stock-status-badge ${p.stock > 0 ? 'stock-in' : 'stock-out'}">
        ${p.stock > 0 ? `● В наличии: ${p.stock} шт.` : '✕ Нет в наличии'}
      </div>

      <div class="product-details-desc">
        ${p.description || 'Описание отсутствует.'}
      </div>

      <div class="product-actions-bar">
        <div class="product-qty-wrap">
          <button type="button" class="product-qty-btn" onclick="changeDetailQty(-1)">-</button>
          <input type="text" id="detailQtyInput" class="product-qty-input" value="1" readonly>
          <button type="button" class="product-qty-btn" onclick="changeDetailQty(1, ${p.stock})">+</button>
        </div>

        <button class="btn btn-primary product-buy-btn" onclick="addDetailToCart(${p.id})" ${p.stock <= 0 ? 'disabled' : ''}>
          ${p.stock > 0 ? 'В КОРЗИНУ' : 'НЕТ В НАЛИЧИИ'}
        </button>

        <button class="btn btn-secondary product-wish-toggle ${isWished ? 'active' : ''}" onclick="toggleWish(event, ${p.id})">
          ${isWished ? 'В ИЗБРАННОМ' : 'В ИЗБРАННОЕ'}
        </button>
      </div>

      <div class="product-perks">
        <div class="perk-item">
          <span class="perk-icon">✦</span>
          <span>Оригинальный фирменный крой Dark Legion</span>
        </div>
        <div class="perk-item">
          <span class="perk-icon">✦</span>
          <span>Быстрая отправка CDEK / Почта России</span>
        </div>
        <div class="perk-item">
          <span class="perk-icon">✦</span>
          <span>Гарантия возврата при сохранении бирок в течение 14 дней</span>
        </div>
      </div>
    </div>

    <div style="grid-column: 1 / -1; margin-top: 30px;">
      <div class="reviews-section">
        <div class="reviews-header">
          <h3 style="font-size: 22px; font-weight: 700;">Отзывы покупателей (${reviews.length})</h3>
          <span class="strict-badge">Проверенные покупки</span>
        </div>
        <div class="reviews-list" style="margin-top: 14px;">${reviewsHtml}</div>
        ${reviewFormHtml}
      </div>
    </div>
  `;
}

function switchProductGalleryImage(src, btn) {
  const mainImg = $('mainProductImg');
  if (mainImg) {
    mainImg.src = src;
  }
  $$('.thumb-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
}

function changeDetailQty(delta, maxStock = 999) {
  const input = $('detailQtyInput');
  if (!input) return;
  let val = parseInt(input.value) || 1;
  val = Math.max(1, Math.min(val + delta, maxStock));
  input.value = val;
}

function addDetailToCart(productId) {
  const input = $('detailQtyInput');
  const qty = input ? (parseInt(input.value) || 1) : 1;
  addToCart(productId, qty);
}

function getNoun(number, one, two, five) {
  let n = Math.abs(number) % 100;
  if (n >= 5 && n <= 20) return five;
  n %= 10;
  if (n === 1) return one;
  if (n >= 2 && n <= 4) return two;
  return five;
}

async function submitReview(event, productId) {
  event.preventDefault();
  const rating = $('reviewRating').value;
  const comment = $('reviewComment').value;

  const { ok, data } = await api(`/api/products/${productId}/reviews`, 'POST', { rating, comment });
  if (ok) {
    showToast('Отзыв опубликован');
    await loadProducts();
    openProductPage(productId, false);
  } else {
    showToast(data.error || 'Ошибка при отправке');
  }
}

async function loadCart() {
  const { ok, data } = await api('/api/cart');
  if (ok) renderCart(data);
}

function renderCart(cartData) {
  $('cartBadge').textContent = cartData.itemsCount || 0;
  const container = $('cartItemsList');
  container.innerHTML = '';

  const items = cartData.items || [];
  $('checkoutBtn').disabled = items.length === 0;

  if (items.length === 0) {
    container.innerHTML = '<div style="text-align: center; color: var(--text-dim); padding: 40px 10px; font-size: 16px;">Корзина пуста</div>';
  } else {
    items.forEach(it => {
      const imgSrc = it.image ? `/uploads/${it.image}` : '/assets/images/no_image.jpg';
      const itemEl = document.createElement('div');
      itemEl.className = 'cart-item';
      itemEl.innerHTML = `
        <img src="${imgSrc}" class="cart-item-img" onerror="this.src='/assets/images/no_image.jpg'">
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

  $('cartSubtotal').textContent = `${cartData.subtotal.toLocaleString('ru-RU')} ₽`;
  const discountRow = $('discountRow');
  if (cartData.discountAmount > 0) {
    discountRow.style.display = 'flex';
    $('cartDiscount').textContent = `-${cartData.discountAmount.toLocaleString('ru-RU')} ₽ (${cartData.promoDiscount}%)`;
  } else {
    discountRow.style.display = 'none';
  }

  $('cartFinalTotal').textContent = `${cartData.finalTotal.toLocaleString('ru-RU')} ₽`;
  $('checkoutTotalAmount').textContent = `${cartData.finalTotal.toLocaleString('ru-RU')} ₽`;
}

async function addToCart(productId, qty = 1) {
  const { ok, data } = await api('/api/cart/add', 'POST', { productId, quantity: qty });
  if (ok) {
    showToast('Добавлено в корзину');
    await loadCart();
  } else {
    showToast(data.error || 'Ошибка добавления');
  }
}

async function updateQty(productId, newQty) {
  const { ok, data } = await api('/api/cart/update', 'POST', { productId, quantity: newQty });
  if (ok) await loadCart();
  else showToast(data.error || 'Не удалось обновить');
}

async function removeFromCart(productId) {
  const { ok } = await api('/api/cart/remove', 'POST', { productId });
  if (ok) await loadCart();
}

async function clearCart() {
  const { ok } = await api('/api/cart/clear', 'POST');
  if (ok) await loadCart();
}

async function applyPromo() {
  const code = $('promoInput').value.trim();
  const notice = $('promoNotice');
  if (!code) return;

  const { ok, data } = await api('/api/promo/apply', 'POST', { code });
  notice.style.color = ok ? 'var(--success)' : 'var(--danger)';
  notice.textContent = ok ? data.message : data.error;
  if (ok) await loadCart();
}

function toggleCart() {
  const drawer = $('cartDrawer');
  if (drawer) drawer.classList.toggle('active');
}
function openCart() {
  const drawer = $('cartDrawer');
  if (drawer) drawer.classList.add('active');
}
function closeCart() {
  const drawer = $('cartDrawer');
  if (drawer) drawer.classList.remove('active');
}

function openCheckout() {
  if (!currentUser) {
    closeCart();
    showToast('Требуется авторизация');
    return openAuthModal('login');
  }
  closeCart();
  if ($('orderName')) $('orderName').value = currentUser.full_name || '';
  if ($('orderPhone')) $('orderPhone').value = currentUser.phone || '';
  if ($('orderTgUsername')) $('orderTgUsername').value = '';
  
  const modal = $('checkoutModal');
  if (modal) modal.classList.add('active');
  
  const dm = $('orderDeliveryMethod');
  if (dm) dm.selectedIndex = 0;
  const kt = $('orderKladType');
  if (kt) kt.value = 'обычная';
  onDeliveryMethodChange();
}

function closeCheckout() { $('checkoutModal').classList.remove('active'); }

function setupMinDeliveryDate() {
  const dateInput = $('orderDeliveryDate');
  if (dateInput) {
    const today = new Date().toISOString().split('T')[0];
    dateInput.min = today;
    dateInput.value = today;
  }
}

function onDeliveryMethodChange() {
  const method = $('orderDeliveryMethod');
  const dateLabel = $('orderDeliveryDateLabel');
  const paySelect = $('orderPaymentMethod');
  const cashOpt = $('payOptionCash');
  const phoneGroup = $('phoneFieldGroup');
  const tgGroup = $('tgFieldGroup');
  const phoneInput = $('orderPhone');
  const tgInput = $('orderTgUsername');
  const kladTypeGroup = $('kladTypeGroup');
  if (!method) return;

  const isKlad = method.value === 'Клад';

  if (kladTypeGroup) {
    kladTypeGroup.style.display = isKlad ? 'flex' : 'none';
    if (isKlad) onKladTypeChange();
  }

  if (dateLabel) {
    dateLabel.textContent = isKlad ? 'Желаемый день поисков' : 'Желаемая дата доставки';
  }

  if (phoneGroup && tgGroup) {
    phoneGroup.style.display = isKlad ? 'none' : '';
    tgGroup.style.display = isKlad ? '' : 'none';
    phoneInput.required = !isKlad;
    tgInput.required = isKlad;
  }

  if (cashOpt && paySelect) {
    cashOpt.disabled = isKlad;
    cashOpt.style.display = isKlad ? 'none' : '';
    if (isKlad && paySelect.value === 'При получении') {
      paySelect.value = 'СБП';
    }
  }
}

function onKladTypeChange() {
  const kladSelect = $('orderKladType');
  const hint = $('kladTypeHint');
  if (!kladSelect || !hint) return;

  const isExtrimm = kladSelect.value === 'EXTRIMM';
  if (isExtrimm) {
    kladSelect.classList.add('extrimm-mode');
    hint.innerHTML = '<span style="color: #ff2a6d; font-weight: 700;">💀 EXTRIMM:</span> Координаты у отделов полиции (ОВД) или на заброшках Москвы. Максимальный адреналин!';
  } else {
    kladSelect.classList.remove('extrimm-mode');
    hint.innerHTML = '<span style="color: #05d9e8; font-weight: 600;">✦ Обычная:</span> Спокойный тайник в черте Москвы (парки, тихие улицы, городские ориентиры).';
  }
}

async function submitCheckout(event) {
  event.preventDefault();
  const deliveryMethod = $('orderDeliveryMethod').value;
  const isKlad = deliveryMethod === 'Клад';
  const kladType = isKlad ? ($('orderKladType')?.value || 'обычная') : null;

  let contactValue;
  let cleanTg = '';
  if (isKlad) {
    cleanTg = ($('orderTgUsername').value || '').trim().replace(/^@/, '');
    if (!cleanTg) return showToast('Укажите username Telegram');
    contactValue = '@' + cleanTg;
  } else {
    contactValue = $('orderPhone').value;
  }

  const payload = {
    customer_name: $('orderName').value,
    customer_phone: contactValue,
    delivery_method: isKlad ? `Клад (${kladType})` : deliveryMethod,
    klad_type: kladType,
    delivery_date: $('orderDeliveryDate').value,
    payment_method: $('orderPaymentMethod').value
  };

  const { ok, data } = await api('/api/checkout', 'POST', payload);
  if (ok) {
    closeCheckout();
    await loadCart();
    await loadProducts();

    if (isKlad && data.klad) {
      openKladModal(data.orderId, data.klad, cleanTg, kladType);
    } else {
      showToast(`Заказ №${data.orderId} оформлен`);
      navigateTo('profile');
    }
  } else {
    showToast(data.error || 'Ошибка при оформлении');
  }
}

function openKladModal(orderId, klad, tgUsername, kladType) {
  $('kladOrderId').textContent = orderId;

  const statusLine = $('kladStatusLine');
  const tgBtn = $('kladTgBtn');
  const tgBtnText = $('kladTgBtnText');
  const isExtrimm = kladType === 'EXTRIMM' || (klad?.spot?.type === 'extrimm');

  const modeBadge = isExtrimm
    ? '<div style="display:inline-block; background: rgba(255, 42, 109, 0.2); color: #ff2a6d; border: 1px solid #ff2a6d; padding: 4px 10px; border-radius: 4px; font-weight: 700; margin-bottom: 10px; font-size: 12px; letter-spacing: 1px;">💀 РЕЖИМ EXTRIMM (Полиция / Заброшки)</div>'
    : '<div style="display:inline-block; background: rgba(5, 217, 232, 0.2); color: #05d9e8; border: 1px solid #05d9e8; padding: 4px 10px; border-radius: 4px; font-weight: 700; margin-bottom: 10px; font-size: 12px; letter-spacing: 1px;">✦ РЕЖИМ: ОБЫЧНАЯ ДОСТАВКА</div>';

  if (klad.sentDirectly) {
    statusLine.innerHTML = `
      ${modeBadge}
      <div style="color: #4ade80; font-weight: 700; margin-bottom: 6px;">● КООРДИНАТЫ ОТПРАВЛЕНЫ В ВАШ TELEGRAM</div>
      <div>Бот отправил точную локацию и ориентир в диалог с <b>@${escapeJs(tgUsername)}</b>. Проверьте личные сообщения!</div>
    `;
    tgBtnText.textContent = 'ПЕРЕЙТИ В ДИАЛОГ С БОТОМ';
    tgBtn.href = `https://t.me/${klad.botUsername || 'pidl_dark_bot'}`;
  } else {
    statusLine.innerHTML = `
      ${modeBadge}
      <div style="color: #38bdf8; font-weight: 700; margin-bottom: 6px;">● СИГНАЛ СФОРМИРОВАН ДЛЯ @${escapeJs(tgUsername)}</div>
      <div>Адрес тайника в Москве зарезервирован (${isExtrimm ? 'экстремальная зона' : 'городской тайник'}). Нажмите кнопку ниже — откроется бот, и координаты моментально выдадутся:</div>
    `;
    tgBtnText.textContent = '⚡ ПОЛУЧИТЬ КООРДИНАТЫ В TELEGRAM';
    tgBtn.href = klad.botLink || `https://t.me/${klad.botUsername || 'pidl_dark_bot'}?start=order_${orderId}`;
  }

  $('kladModal').classList.add('active');
}

function closeKladModal() {
  $('kladModal').classList.remove('active');
  navigateTo('profile');
}

const validationFields = {
  login: { id: 'regLogin', errId: 'err-regLogin', check: v => /^[a-zA-Z0-9]{6,}$/.test(v.trim()), msg: 'Латинские буквы и цифры, не менее 6 символов' },
  password: { id: 'regPassword', errId: 'err-regPassword', check: v => v && v.length >= 8, msg: 'Минимум 8 символов' },
  fullName: { id: 'regFullName', errId: 'err-regFullName', check: v => /^[А-Яа-яЁё\s]+$/.test(v.trim()), msg: 'Только кириллица и пробелы' },
  phone: { id: 'regPhone', errId: 'err-regPhone', check: v => /^8\(\d{3}\)\d{3}-\d{2}-\d{2}$/.test(v.trim()), msg: 'Формат строго 8(XXX)XXX-XX-XX' },
  email: { id: 'regEmail', errId: 'err-regEmail', check: v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()), msg: 'Корректный email' }
};

function validateField(name) {
  const cfg = validationFields[name];
  if (!cfg) return true;
  const el = $(cfg.id), errEl = $(cfg.errId);
  const valid = Boolean(cfg.check(el.value));
  errEl.textContent = valid ? '' : cfg.msg;
  el.classList.toggle('valid', valid);
  el.classList.toggle('invalid', !valid);
  return valid;
}

async function submitRegister(event) {
  event.preventDefault();
  const valid = Object.keys(validationFields).every(f => validateField(f));
  if (!valid) return showToast('Исправьте ошибки в форме');

  const payload = {
    login: $('regLogin').value.trim(),
    password: $('regPassword').value,
    full_name: $('regFullName').value.trim(),
    phone: $('regPhone').value.trim(),
    email: $('regEmail').value.trim()
  };

  const errBox = $('registerServerErrors');
  errBox.style.display = 'none';

  const { ok, data } = await api('/api/auth/register', 'POST', payload);
  if (ok) {
    currentUser = data.user;
    updateNavAuth();
    closeAuthModal();
    showToast(`Регистрация успешна: ${currentUser.login}`);
  } else {
    errBox.style.display = 'block';
    errBox.innerHTML = data.errors ? Object.values(data.errors).map(e => e.msg).join('<br>') : (data.error || 'Ошибка регистрации');
  }
}

async function submitLogin(event) {
  event.preventDefault();
  const login = $('loginUsername').value.trim();
  const password = $('loginPassword').value;
  const errBox = $('loginError');
  errBox.style.display = 'none';

  const { ok, data } = await api('/api/auth/login', 'POST', { login, password });
  if (ok) {
    currentUser = data.user;
    updateNavAuth();
    closeAuthModal();
    await loadWishlist();
    showToast(`Вы вошли как ${currentUser.login}`);
    if (currentUser.role === 'admin') navigateTo('admin');
  } else {
    errBox.style.display = 'block';
    errBox.textContent = data.error || 'Неверный логин или пароль';
  }
}

async function logout() {
  await api('/api/auth/logout', 'POST');
  currentUser = null;
  userWishlist = [];
  updateNavAuth();
  showToast('Вы вышли из системы');
  navigateTo('catalog');
}

function switchAuthTab(tab) {
  $('authTabLogin').classList.toggle('active', tab === 'login');
  $('authTabRegister').classList.toggle('active', tab === 'register');
  $('loginFormContainer').classList.toggle('active', tab === 'login');
  $('registerFormContainer').classList.toggle('active', tab === 'register');
}

function openAuthModal(defaultTab = 'login') {
  switchAuthTab(defaultTab);
  $('authModal').classList.add('active');
}

function closeAuthModal() {
  $('authModal').classList.remove('active');
}

function quickFillAdmin() {
  $('loginUsername').value = 'lab16';
  $('loginPassword').value = 'prac3';
}

async function loadProfile() {
  if (!currentUser) return;
  $('profileInitials').textContent = (currentUser.login || 'US').slice(0, 2).toUpperCase();
  $('profileFullName').textContent = currentUser.full_name;
  $('profileLogin').textContent = `@${currentUser.login}`;
  $('profilePhone').textContent = currentUser.phone;
  $('profileEmail').textContent = currentUser.email;
  $('profileRole').textContent = currentUser.role === 'admin' ? 'Администратор' : 'Пользователь';

  const { ok, data } = await api('/api/orders/my');
  const list = $('ordersList');
  list.innerHTML = '';

  const orders = data.orders || [];
  if (!ok || orders.length === 0) {
    list.innerHTML = '<p style="color: var(--text-dim); font-size: 16px;">У вас пока нет заказов.</p>';
    return;
  }

  orders.forEach(o => {
    const statusClass = STATUS_CLASSES[o.status] || 'status-new';
    const itemsStr = (o.items || []).map(it => `<li>${it.title} — ${it.quantity} шт. × ${it.price.toLocaleString('ru-RU')} ₽</li>`).join('');
    const box = document.createElement('div');
    box.className = 'order-box';
    box.innerHTML = `
      <div class="order-header">
        <span class="order-id">Заказ #${o.id}</span>
        <span class="order-status ${statusClass}">${o.status}</span>
      </div>
      <div style="font-size: 14px; color: var(--text-dim); margin-bottom: 8px;">
        ${o.created_at} • ${o.delivery_method} (${o.delivery_date}) • ${o.payment_method}
      </div>
      <ul class="order-items-list">${itemsStr}</ul>
      <div class="order-footer">
        <span>${o.promo_code ? `Промокод: ${o.promo_code}` : 'Без скидки'}</span>
        <span style="font-weight: 700; color: #fff;">Итого: ${o.total_price.toLocaleString('ru-RU')} ₽</span>
      </div>
    `;
    list.appendChild(box);
  });
}

function switchAdminTab(tab) {
  const isCatalog = tab === 'catalog-mgmt';
  const isOrders = tab === 'orders';
  const isAdd = tab === 'add-product';

  if ($('tabCatalogBtn')) $('tabCatalogBtn').classList.toggle('active', isCatalog);
  if ($('tabOrdersBtn')) $('tabOrdersBtn').classList.toggle('active', isOrders);
  if ($('tabAddProductBtn')) $('tabAddProductBtn').classList.toggle('active', isAdd);

  if ($('adminCatalogSubView')) $('adminCatalogSubView').classList.toggle('active', isCatalog);
  if ($('adminOrdersSubView')) $('adminOrdersSubView').classList.toggle('active', isOrders);
  if ($('adminProductSubView')) $('adminProductSubView').classList.toggle('active', isAdd);

  if (isCatalog) {
    renderAdminProductsList();
  } else if (isOrders) {
    loadAdminOrders();
  }
}

function renderAdminProductsList() {
  if (!currentUser || currentUser.role !== 'admin') return;
  const container = $('adminProductsList');
  if (!container) return;

  const searchInput = $('adminProductSearch');
  const searchQuery = searchInput ? searchInput.value.trim().toLowerCase() : '';
  const catSelect = $('adminProductCategoryFilter');
  const catFilter = catSelect ? catSelect.value : 'Все';

  let list = allProducts.slice();
  if (catFilter !== 'Все') {
    list = list.filter(p => p.category === catFilter || p.extra_category === catFilter);
  }
  if (searchQuery) {
    list = list.filter(p => 
      p.title.toLowerCase().includes(searchQuery) ||
      (p.description && p.description.toLowerCase().includes(searchQuery)) ||
      String(p.id) === searchQuery
    );
  }

  const countEl = $('adminProductsCount');
  if (countEl) {
    countEl.innerHTML = `Показано позиций: <strong>${list.length}</strong> из <strong>${allProducts.length}</strong>`;
  }

  container.innerHTML = '';
  if (list.length === 0) {
    container.innerHTML = '<div style="padding: 30px; text-align: center; color: var(--text-dim); font-size: 18px;">Товары не найдены</div>';
    return;
  }

  list.forEach(p => {
    const images = (p.images && p.images.length > 0) ? p.images : (p.image ? [p.image] : []);
    const thumb = images[0] ? `/uploads/${images[0]}` : '/assets/images/no_image.jpg';
    const isOut = p.stock <= 0;

    const row = document.createElement('div');
    row.className = 'admin-prod-row';
    row.innerHTML = `
      <div class="admin-prod-main" onclick="openProductPage(${p.id})">
        <img src="${thumb}" alt="${p.title}" class="admin-prod-thumb" onerror="this.src='/assets/images/no_image.jpg'">
        <div class="admin-prod-info">
          <div class="admin-prod-title">#${p.id} — ${p.title}</div>
          <div class="admin-prod-meta">
            <span>Категория: <strong>${p.category || 'Одежда'}</strong></span>
            ${p.extra_category ? `<span class="extra-badge">${p.extra_category}</span>` : ''}
            <span>★ ${p.avg_rating || '5.0'} (${p.reviews_count || 0})</span>
            <span>📷 ${images.length} фото</span>
          </div>
        </div>
      </div>
      <div class="admin-prod-stats">
        <div class="admin-prod-price">${Number(p.price).toLocaleString('ru-RU')} ₽</div>
        <div class="admin-prod-stock ${isOut ? 'stock-out' : 'stock-in'}">
          ${isOut ? '✕ Нет в наличии' : `● ${p.stock} шт.`}
        </div>
      </div>
      <div class="admin-prod-actions">
        <button class="btn btn-admin-edit" onclick="openEditProductModal(${p.id})">✎ Редактировать</button>
        <button class="btn btn-admin-delete" onclick="deleteProduct(${p.id}, '${escapeJs(p.title)}')">✕ Удалить</button>
      </div>
    `;
    container.appendChild(row);
  });
}

async function deleteProduct(productId, title) {
  if (!currentUser || currentUser.role !== 'admin') return;

  const confirmed = confirm(`Вы уверены, что хотите безвозвратно удалить товар "${title}" (ID: ${productId})?\n\nВсе отзывы и фото товара также будут удалены.`);
  if (!confirmed) return;

  const { ok, data } = await api(`/api/products/${productId}`, 'DELETE');
  if (ok) {
    showToast('Товар успешно удален');
    await loadProducts();
    renderAdminProductsList();

    if ($('productView') && $('productView').classList.contains('active')) {
      const match = window.location.pathname.match(/\/product\/(\d+)/);
      if (match && parseInt(match[1]) === productId) {
        navigateTo('catalog');
      }
    }
  } else {
    showToast(data.error || 'Ошибка при удалении товара');
  }
}

async function loadAdminOrders() {
  if (!currentUser || currentUser.role !== 'admin') return;
  const status = $('adminStatusFilter').value;
  const { ok, data } = await api(`/api/admin/orders?status=${encodeURIComponent(status)}`);
  const container = $('adminOrdersList');
  container.innerHTML = '';

  const orders = data.orders || [];
  if (!ok || orders.length === 0) {
    container.innerHTML = '<p style="color: var(--text-dim); padding: 20px; font-size: 16px;">Заказы не найдены</p>';
    return;
  }

  orders.forEach(o => {
    const statusClass = STATUS_CLASSES[o.status] || 'status-new';
    const itemsStr = (o.items || []).map(i => `${i.title} (${i.quantity} шт.)`).join(', ');
    const card = document.createElement('div');
    card.className = 'admin-order-card';
    card.innerHTML = `
      <div class="admin-order-top">
        <div class="admin-check-wrap">
          <input type="checkbox" class="order-select-check" value="${o.id}">
          <strong style="font-size: 16px;">Заказ #${o.id}</strong> — ${o.customer_name} (${o.customer_phone})
        </div>
        <span class="order-status ${statusClass}">${o.status}</span>
      </div>
      <div style="font-size: 15px; color: var(--text-muted);">Состав: ${itemsStr}</div>
      <div style="font-size: 14px; color: var(--text-dim);">
        Доставка: ${o.delivery_method} • Дата: ${o.delivery_date} • Оплата: ${o.payment_method} • Сумма: ${o.total_price} ₽
      </div>
      <div style="display: flex; align-items: center; gap: 8px; margin-top: 6px;">
        <label style="font-size: 14px;">Статус:</label>
        <select style="width: 150px; padding: 5px 8px; font-size: 14px;" onchange="updateSingleOrderStatus(${o.id}, this.value)">
          <option value="Новый" ${o.status === 'Новый' ? 'selected' : ''}>Новый</option>
          <option value="В обработке" ${o.status === 'В обработке' ? 'selected' : ''}>В обработке</option>
          <option value="Завершено" ${o.status === 'Завершено' ? 'selected' : ''}>Завершено</option>
        </select>
      </div>
    `;
    container.appendChild(card);
  });
}

async function updateSingleOrderStatus(orderId, newStatus) {
  const { ok } = await api(`/api/admin/orders/${orderId}/status`, 'POST', { status: newStatus });
  if (ok) {
    showToast(`Статус заказа #${orderId} изменен`);
    loadAdminOrders();
  }
}

async function applyBatchStatus() {
  const checkboxes = $$('.order-select-check:checked');
  const orderIds = Array.from(checkboxes).map(cb => parseInt(cb.value));
  const newStatus = $('adminBatchStatus').value;

  if (orderIds.length === 0) return showToast('Выберите заказы');

  const { ok } = await api('/api/admin/orders/batch-status', 'POST', { orderIds, status: newStatus });
  if (ok) {
    showToast(`Статус обновлен для ${orderIds.length} заказов`);
    loadAdminOrders();
  }
}

let selectedFiles = [];

function triggerPhotoSelect() {
  const input = $('singlePhotoInput');
  if (input) input.click();
}

function addPhotosToQueue(files) {
  if (!files || files.length === 0) return;
  let added = 0;
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    if (file.type && !file.type.startsWith('image/')) continue;
    if (selectedFiles.length >= 5) {
      showToast('Лимит: максимум 5 фотографий');
      break;
    }
    selectedFiles.push(file);
    added++;
  }
  if (added > 0) {
    showToast(`Добавлено фото: +${added} (всего: ${selectedFiles.length}/5)`);
  }
  renderPhotoPreviews();
}

function handleSinglePhotoAdd(event) {
  const files = event.target.files;
  if (files && files.length > 0) {
    addPhotosToQueue(files);
  }
  event.target.value = '';
}

function removeSelectedPhoto(index) {
  selectedFiles.splice(index, 1);
  renderPhotoPreviews();
}

function makeCoverPhoto(index) {
  if (index <= 0 || index >= selectedFiles.length) return;
  const picked = selectedFiles.splice(index, 1)[0];
  selectedFiles.unshift(picked);
  showToast('Фото назначено обложкой');
  renderPhotoPreviews();
}

function renderPhotoPreviews() {
  const container = $('photoPreviewsList');
  if (!container) return;
  container.innerHTML = '';

  const counter = $('photoCounter');
  if (counter) {
    counter.textContent = `${selectedFiles.length} / 5`;
    counter.classList.toggle('full', selectedFiles.length >= 5);
  }

  const dropHint = $('photoDropHint');
  if (dropHint) {
    dropHint.style.display = selectedFiles.length === 0 ? 'flex' : 'none';
  }

  selectedFiles.forEach((file, idx) => {
    const url = URL.createObjectURL(file);
    const item = document.createElement('div');
    item.className = `photo-preview-item ${idx === 0 ? 'is-cover' : ''}`;
    item.innerHTML = `
      <img src="${url}" alt="Фото ${idx + 1}">
      <span class="preview-badge ${idx === 0 ? 'cover-badge' : ''}">
        ${idx === 0 ? '★ ОБЛОЖКА' : '#' + (idx + 1)}
      </span>
      ${idx > 0 ? `<button type="button" class="preview-make-cover" onclick="makeCoverPhoto(${idx})" title="Сделать обложкой карточки">★</button>` : ''}
      <button type="button" class="preview-remove-btn" onclick="removeSelectedPhoto(${idx})" title="Удалить">✕</button>
    `;
    container.appendChild(item);
  });

  const addCard = $('photoAddCard');
  if (addCard) {
    addCard.style.display = selectedFiles.length >= 5 ? 'none' : 'flex';
  }
}

function initPhotoDragAndDrop() {
  const box = $('photoUploaderBox');
  if (!box) return;

  ['dragenter', 'dragover'].forEach(name => {
    box.addEventListener(name, (e) => {
      e.preventDefault();
      e.stopPropagation();
      box.classList.add('drag-active');
    }, false);
  });

  ['dragleave', 'drop'].forEach(name => {
    box.addEventListener(name, (e) => {
      e.preventDefault();
      e.stopPropagation();
      box.classList.remove('drag-active');
    }, false);
  });

  box.addEventListener('drop', (e) => {
    const dt = e.dataTransfer;
    if (dt && dt.files && dt.files.length) {
      addPhotosToQueue(dt.files);
    }
  }, false);
}

async function submitNewProduct(event) {
  event.preventDefault();
  const form = $('addProductForm');
  const formData = new FormData(form);

  formData.delete('images');
  selectedFiles.forEach(file => {
    formData.append('images', file);
  });

  const { ok, data } = await api('/api/products', 'POST', formData);
  if (ok) {
    showToast('Товар успешно добавлен в каталог');
    form.reset();
    selectedFiles = [];
    renderPhotoPreviews();
    await loadProducts();
    switchAdminTab('catalog-mgmt');
    navigateTo('catalog');
  } else {
    showToast(data.error || 'Ошибка сохранения');
  }
}

let editExistingImages = [];
let editNewFiles = [];

function openEditProductModal(productId) {
  const p = allProducts.find(item => item.id === productId);
  if (!p) return showToast('Товар не найден');

  const modal = $('editProductModal');
  if (!modal) return;

  $('editProdId').value = p.id;
  $('editProdTitle').value = p.title;
  $('editProdCategory').value = p.category || 'Худи+zip';
  $('editProdExtraCategory').value = p.extra_category || '';
  $('editProdPrice').value = p.price;
  $('editProdStock').value = p.stock;
  $('editProdDesc').value = p.description || '';
  $('editProductHeadingId').textContent = `#${p.id} — ${p.title}`;

  const images = (p.images && p.images.length > 0) ? p.images : (p.image ? [p.image] : []);
  editExistingImages = [...images];
  editNewFiles = [];

  renderEditPhotoPreviews();
  modal.classList.add('active');
}

function closeEditProductModal() {
  const modal = $('editProductModal');
  if (modal) modal.classList.remove('active');
  editExistingImages = [];
  editNewFiles = [];
}

function triggerEditPhotoSelect() {
  const input = $('editSinglePhotoInput');
  if (input) input.click();
}

function handleEditPhotoAdd(event) {
  const files = event.target.files;
  if (!files || files.length === 0) return;

  let added = 0;
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    if (file.type && !file.type.startsWith('image/')) continue;
    if (editExistingImages.length + editNewFiles.length >= 5) {
      showToast('Лимит: максимум 5 фотографий');
      break;
    }
    editNewFiles.push(file);
    added++;
  }
  if (added > 0) {
    showToast(`Добавлено новых фото: +${added}`);
  }
  event.target.value = '';
  renderEditPhotoPreviews();
}

function removeEditExistingPhoto(index) {
  editExistingImages.splice(index, 1);
  renderEditPhotoPreviews();
}

function removeEditNewPhoto(index) {
  editNewFiles.splice(index, 1);
  renderEditPhotoPreviews();
}

function renderEditPhotoPreviews() {
  const container = $('editPhotoPreviewsList');
  if (!container) return;
  container.innerHTML = '';

  const total = editExistingImages.length + editNewFiles.length;
  const counter = $('editPhotoCounter');
  if (counter) {
    counter.textContent = `${total} / 5`;
    counter.classList.toggle('full', total >= 5);
  }

  const dropHint = $('editPhotoDropHint');
  if (dropHint) {
    dropHint.style.display = total === 0 ? 'flex' : 'none';
  }

  let previewIndex = 0;

  editExistingImages.forEach((imgFilename, idx) => {
    const isCover = previewIndex === 0;
    const item = document.createElement('div');
    item.className = `photo-preview-item ${isCover ? 'is-cover' : ''}`;
    item.innerHTML = `
      <img src="/uploads/${imgFilename}" alt="Фото ${idx + 1}" onerror="this.src='/assets/images/no_image.jpg'">
      <span class="preview-badge ${isCover ? 'cover-badge' : ''}">
        ${isCover ? '★ ОБЛОЖКА' : '#' + (previewIndex + 1)}
      </span>
      <button type="button" class="preview-remove-btn" onclick="removeEditExistingPhoto(${idx})" title="Удалить фото">✕</button>
    `;
    container.appendChild(item);
    previewIndex++;
  });

  editNewFiles.forEach((file, idx) => {
    const isCover = previewIndex === 0;
    const url = URL.createObjectURL(file);
    const item = document.createElement('div');
    item.className = `photo-preview-item ${isCover ? 'is-cover' : ''}`;
    item.innerHTML = `
      <img src="${url}" alt="Новое фото ${idx + 1}">
      <span class="preview-badge ${isCover ? 'cover-badge' : ''}">
        ${isCover ? '★ ОБЛОЖКА' : 'НОВОЕ #' + (previewIndex + 1)}
      </span>
      <button type="button" class="preview-remove-btn" onclick="removeEditNewPhoto(${idx})" title="Удалить">✕</button>
    `;
    container.appendChild(item);
    previewIndex++;
  });

  const addCard = $('editPhotoAddCard');
  if (addCard) {
    addCard.style.display = total >= 5 ? 'none' : 'flex';
  }
}

async function submitEditProduct(event) {
  event.preventDefault();
  const productId = parseInt($('editProdId').value);
  if (!productId) return showToast('Ошибка ID товара');

  const form = $('editProductForm');
  const formData = new FormData(form);

  formData.append('existing_images', JSON.stringify(editExistingImages));

  formData.delete('images');
  editNewFiles.forEach(file => {
    formData.append('images', file);
  });

  const { ok, data } = await api(`/api/products/${productId}`, 'PUT', formData);
  if (ok) {
    showToast('Товар успешно обновлен');
    closeEditProductModal();
    await loadProducts();
    renderAdminProductsList();

    if ($('productView') && $('productView').classList.contains('active')) {
      const match = window.location.pathname.match(/\/product\/(\d+)/);
      if (match && parseInt(match[1]) === productId) {
        openProductPage(productId, false);
      }
    }
  } else {
    showToast(data.error || 'Ошибка обновления товара');
  }
}

async function loadWishlist() {
  if (!currentUser) {
    userWishlist = [];
    $('wishlistBadge').textContent = '0';
    return;
  }
  const { ok, data } = await api('/api/wishlist');
  if (ok) {
    userWishlist = (data.wishlist || []).map(p => p.id);
    $('wishlistBadge').textContent = userWishlist.length;
  }
}

async function toggleWish(event, productId) {
  if (event) event.stopPropagation();
  if (!currentUser) return (showToast('Требуется авторизация'), openAuthModal('login'));

  const { ok, data } = await api('/api/wishlist/toggle', 'POST', { productId });
  if (ok) {
    if (data.inWishlist) {
      if (!userWishlist.includes(productId)) userWishlist.push(productId);
      showToast('Добавлено в избранное');
    } else {
      userWishlist = userWishlist.filter(id => id !== productId);
      showToast('Удалено из избранного');
    }
    $('wishlistBadge').textContent = userWishlist.length;
    renderProducts();
    renderHeroSpotlight();

    const wishToggleBtn = document.querySelector('.product-wish-toggle');
    if (wishToggleBtn) {
      wishToggleBtn.classList.toggle('active', data.inWishlist);
      wishToggleBtn.textContent = data.inWishlist ? 'В ИЗБРАННОМ' : 'В ИЗБРАННОЕ';
    }

    const wishView = $('wishlistView');
    if (wishView && wishView.classList.contains('active')) {
      const card = event && event.target ? event.target.closest('.product-card') : null;
      if (card && !data.inWishlist) {
        card.style.transition = 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)';
        card.style.opacity = '0';
        card.style.transform = 'scale(0.88)';
        setTimeout(() => {
          renderWishlist();
        }, 180);
      } else {
        renderWishlist();
      }
    }
  }
}

function renderWishlist() {
  const grid = $('wishlistGrid');
  grid.innerHTML = '';

  const wishedItems = allProducts.filter(p => userWishlist.includes(p.id));
  if (wishedItems.length === 0) {
    grid.innerHTML = '<div style="grid-column: 1/-1; text-align:center; padding: 40px; color: var(--text-dim); font-size: 18px;">Избранное пусто</div>';
    return;
  }

  wishedItems.forEach(p => {
    const images = (p.images && p.images.length > 0) ? p.images : (p.image ? [p.image] : []);
    const imgSrc = images[0] ? `/uploads/${images[0]}` : '/assets/images/no_image.jpg';
    const card = document.createElement('div');
    card.className = 'product-card';
    card.innerHTML = `
      <div class="card-media-wrap" onclick="openProductPage(${p.id})">
        <img src="${imgSrc}" alt="${p.title}" class="card-img" onerror="this.src='/assets/images/no_image.jpg'">
        <button class="wish-btn active" onclick="toggleWish(event, ${p.id})">✕</button>
      </div>
      <div class="card-body">
        ${p.extra_category ? `<span class="card-category">${p.category || 'Одежда'} • <span class="extra-cat-tag">${p.extra_category}</span></span>` : `<span class="card-category">${p.category || 'Одежда'}</span>`}
        <h3 class="card-title" onclick="openProductPage(${p.id})">${p.title}</h3>
        <div class="card-bottom">
          <span class="card-price">${Number(p.price).toLocaleString('ru-RU')} ₽</span>
          <button class="btn btn-secondary btn-sm" onclick="addToCart(${p.id})">В корзину</button>
        </div>
      </div>
    `;
    grid.appendChild(card);
  });
}

function showToast(message) {
  const toast = $('toastNotification');
  toast.textContent = message;
  toast.style.display = 'block';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.style.display = 'none'; }, 2500);
}

function copyCode(code) {
  navigator.clipboard.writeText(code);
  showToast(`Промокод ${code} скопирован`);
  $('promoInput').value = code;
}
