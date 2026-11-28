/* ============================================================
   AZ NUTRITION — interactions
   ============================================================ */
(() => {
  'use strict';

  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];

  /* ---------- sticky header ---------- */
  const header = $('#header');
  const onScroll = () => header.classList.toggle('scrolled', window.scrollY > 10);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ---------- mobile nav ---------- */
  const burger = $('#burger');
  const nav = $('#nav');
  const closeNav = () => {
    nav.classList.remove('open');
    burger.classList.remove('open');
    document.body.style.overflow = '';
  };
  burger.addEventListener('click', () => {
    const open = nav.classList.toggle('open');
    burger.classList.toggle('open', open);
    document.body.style.overflow = open ? 'hidden' : '';
  });
  $$('.nav-link').forEach(l => l.addEventListener('click', closeNav));

  /* ---------- search ---------- */
  const searchBar = $('#searchBar');
  const searchInput = $('#searchInput');
  $('#searchToggle').addEventListener('click', () => {
    searchBar.classList.toggle('open');
    if (searchBar.classList.contains('open')) setTimeout(() => searchInput.focus(), 250);
    else { searchInput.value = ''; applyFilters(); }
  });
  $('#searchClose').addEventListener('click', () => {
    searchBar.classList.remove('open');
    searchInput.value = '';
    applyFilters();
  });
  searchInput.addEventListener('input', applyFilters);

  /* ---------- product filtering ---------- */
  let cards = $$('.product-card');
  let filterBtns = $$('.filter-btn');
  const noResults = $('#noResults');
  let activeCat = 'all';

  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[c]);

  function bindFilterLinks() {
    $$('[data-filter-link]').forEach(link => {
      if (link.dataset.filterBound) return;
      link.dataset.filterBound = '1';
      link.addEventListener('click', e => {
        e.preventDefault();
        setFilter(link.dataset.filterLink);
      });
    });
  }

  function applyFilters() {
    const q = searchInput.value.trim().toLowerCase();
    let visible = 0;
    cards.forEach(card => {
      const catOk = activeCat === 'all' || card.dataset.cat === activeCat;
      const text = (card.dataset.name + ' ' + card.textContent).toLowerCase();
      const searchOk = !q || text.includes(q);
      const show = catOk && searchOk;
      card.classList.toggle('hidden', !show);
      if (show) visible++;
    });
    noResults.hidden = visible > 0;
  }

  function setFilter(cat) {
    activeCat = cat;
    filterBtns.forEach(b => b.classList.toggle('active', b.dataset.filter === cat));
    applyFilters();
  }

  filterBtns.forEach(b => b.addEventListener('click', () => setFilter(b.dataset.filter)));
  bindFilterLinks();

  /* ---------- toast ---------- */
  const toast = $('#toast');
  let toastTimer;
  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 3000);
  }

  /* ============================================================
     SUPABASE AUTH — real accounts that work on every device
     Per-user data (saved items, orders) lives in auth metadata.
     ============================================================ */
  const SB_URL = 'https://oclxrheghqarandewokw.supabase.co';
  const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9jbHhyaGVnaHFhcmFuZGV3b2t3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTU3MzE5MTAsImV4cCI6MjExMTMwNzkxMH0.bIh_eg0YZcfYvk_ehuJ6IMB527uJKS8tHRfkd1myOEs';
  const SESSION_KEY = 'az_sb_session_v1';
  const ADMIN_EMAIL = 'admin@aznutrition.com';
  const REST = '/rest/v1';
  const money = n => '$' + Number(n || 0).toFixed(2);

  /* shared store data (loaded from Supabase, with static fallbacks) */
  const storeData = {
    products: [], allProducts: [],
    categories: [], allCategories: [],
    discounts: [], allDiscounts: [],
    siteText: {}, orders: []
  };
  const loaded = { products: false, discounts: false, categories: false, siteText: false, orders: false };
  let memberDiscount = { code: 'AZ10', percent: 10, note: 'Automatic member discount' };

  async function sb(path, { method = 'GET', body, token, prefer } = {}) {
    const headers = {
      apikey: SB_KEY,
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(prefer ? { Prefer: prefer } : {})
    };
    try {
      const res = await fetch(SB_URL + path, {
        method, headers, body: body ? JSON.stringify(body) : undefined
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = data.msg || data.message || data.error_description ||
          data.error?.message || `Request failed (${res.status})`;
        return { error: msg };
      }
      return { data };
    } catch {
      return { error: 'Cannot reach the server. Check your connection.' };
    }
  }

  function loadSession() {
    try { return JSON.parse(localStorage.getItem(SESSION_KEY)) || null; }
    catch { return null; }
  }
  function saveSession(session) {
    if (!session?.access_token) { localStorage.removeItem(SESSION_KEY); sbSession = null; return; }
    sbSession = {
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_at: Date.now() + (session.expires_in || 3600) * 1000,
      user: session.user
    };
    localStorage.setItem(SESSION_KEY, JSON.stringify(sbSession));
  }
  let sbSession = loadSession();

  /* normalised view of the signed-in user */
  function currentUser() {
    if (!sbSession?.user) return null;
    const m = sbSession.user.user_metadata || {};
    return {
      name: m.name || sbSession.user.email.split('@')[0],
      email: sbSession.user.email,
      saved: Array.isArray(m.saved) ? m.saved : [],
      orders: Array.isArray(m.orders) ? m.orders : []
    };
  }

  function isAdmin() {
    return (currentUser()?.email || '').toLowerCase() === ADMIN_EMAIL;
  }

  /* persist saved/orders into this user's Supabase metadata */
  async function updateProfile(patch) {
    if (!sbSession) return false;
    const m = sbSession.user.user_metadata || {};
    const data = { ...m, ...patch };
    const { data: user, error } = await sb('/auth/v1/user', {
      method: 'PUT', token: sbSession.access_token, body: { data }
    });
    if (error) { showToast(error); return false; }
    sbSession.user = user;
    localStorage.setItem(SESSION_KEY, JSON.stringify(sbSession));
    return true;
  }

  async function refreshSession() {
    if (!sbSession?.refresh_token) return;
    const { data, error } = await sb('/auth/v1/token?grant_type=refresh_token', {
      method: 'POST', body: { refresh_token: sbSession.refresh_token }
    });
    if (error) saveSession(null);
    else saveSession(data);
  }

  /* ---------- cart ---------- */
  const cart = [];            // {id, name, price, img, qty}
  const drawer = $('#cartDrawer');
  const overlay = $('#overlay');
  const itemsEl = $('#cartItems');
  const emptyEl = $('#cartEmpty');

  function openCart() {
    overlay.hidden = false;
    requestAnimationFrame(() => overlay.classList.add('show'));
    drawer.classList.add('open');
    drawer.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }
  function closeCart() {
    overlay.classList.remove('show');
    drawer.classList.remove('open');
    drawer.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    setTimeout(() => { overlay.hidden = true; }, 300);
  }
  $('#cartToggle').addEventListener('click', openCart);
  $('#cartClose').addEventListener('click', closeCart);
  overlay.addEventListener('click', closeCart);

  function discountPercent() {
    return currentUser() && memberDiscount ? Number(memberDiscount.percent) || 0 : 0;
  }

  function renderCart() {
    const user = currentUser();
    const count = cart.reduce((s, i) => s + i.qty, 0);
    const sub = cart.reduce((s, i) => s + i.qty * i.price, 0);
    const rate = discountPercent() / 100;
    const saving = sub * rate;
    const total = sub - saving;

    $('#cartCount').textContent = count;
    $('#cartHeadCount').textContent = `(${count})`;
    $('#cartSub').textContent = money(sub);
    $('#cartTotal').textContent = money(total);
    $('#cartSaveRow').hidden = !rate;
    $('#cartSaveLabel').textContent = `MEMBER SAVING (${discountPercent()}%)`;
    $('#cartSave').textContent = `−${money(saving)}`;
    $('#cartNote').textContent = rate
      ? `Member price applied — you save ${money(saving)}`
      : 'Free shipping on orders over $75';
    $('#checkoutBtn').innerHTML = user
      ? 'CHECKOUT <span class="arr">↗</span>'
      : 'SIGN IN TO CHECKOUT <span class="arr">↗</span>';

    $$('.cart-item', itemsEl).forEach(el => el.remove());
    emptyEl.hidden = cart.length > 0;

    cart.forEach(item => {
      const row = document.createElement('div');
      row.className = 'cart-item';
      row.innerHTML = `
        <img src="${item.img}" alt="${item.name}">
        <div>
          <p class="ci-name">${item.name}</p>
          <p class="ci-price">${money(item.price)}</p>
          <div class="ci-qty">
            <button data-act="dec" aria-label="Decrease">−</button>
            <span>${item.qty}</span>
            <button data-act="inc" aria-label="Increase">+</button>
          </div>
        </div>
        <button class="ci-remove" data-act="rm" aria-label="Remove">✕</button>`;

      row.addEventListener('click', e => {
        const act = e.target.closest('[data-act]')?.dataset.act;
        if (!act) return;
        if (act === 'inc') item.qty++;
        if (act === 'dec') item.qty = Math.max(0, item.qty - 1);
        if (act === 'rm') item.qty = 0;
        const idx = cart.indexOf(item);
        if (item.qty === 0) cart.splice(idx, 1);
        renderCart();
      });
      itemsEl.appendChild(row);
    });
  }

  function addToCart({ id, name, price, img }, qty = 1) {
    const found = cart.find(i => i.id === id);
    if (found) found.qty += qty;
    else cart.push({ id, name, price: parseFloat(price), img, qty });
    renderCart();
  }

  /* ---------- account modal ---------- */
  const accModal = $('#accountModal');
  const authView = $('#authView');
  const dashView = $('#dashView');
  let authMode = 'signin';

  function openAccount(view = currentUser() ? 'dash' : 'auth', msg = '') {
    if (view === 'dash' && !currentUser()) view = 'auth';
    authView.hidden = view !== 'auth';
    dashView.hidden = view !== 'dash';
    if (view === 'dash') renderDashboard();
    else {
      if (msg) $('#authIntro').textContent = msg;
      clearErrors();
      setTimeout(() => $('#accEmail').focus(), 280);
    }
    accModal.classList.add('open');
    document.body.style.overflow = 'hidden';
  }
  function closeAccount() {
    accModal.classList.remove('open');
    document.body.style.overflow = '';
    if (!currentUser()) $('#authIntro').textContent = 'Sign in to track orders, save products and unlock member pricing.';
  }
  $('#accountBtn').addEventListener('click', () => openAccount());
  $('#accountClose').addEventListener('click', closeAccount);
  $('#dashClose').addEventListener('click', closeAccount);
  accModal.addEventListener('click', e => { if (e.target === accModal) closeAccount(); });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { closeCart(); closeNav(); closeAccount(); closeAdmin(); }
  });

  function setAuthMode(mode) {
    authMode = mode;
    const up = mode === 'signup';
    $('#authTitle').textContent = up ? 'JOIN THE CLUB.' : 'WELCOME BACK.';
    $('#nameField').hidden = !up;
    $('#confirmField').hidden = !up;
    $('#accSwitch').textContent = up ? 'Sign in instead' : 'Create an account';
    $('#authSubmit').innerHTML = (up ? 'CREATE ACCOUNT' : 'SIGN IN') + ' <span class="arr">↗</span>';
    $('#accPass').placeholder = up ? 'Min. 8 chars, 1 letter + 1 number' : 'Your password';
    $('#authIntro').textContent = up
      ? 'Create a free account to unlock member pricing and order tracking.'
      : 'Sign in to track orders, save products and unlock member pricing.';
    clearErrors();
    $('#accountForm').reset();
  }
  $('#accSwitch').addEventListener('click', () => setAuthMode(authMode === 'signin' ? 'signup' : 'signin'));

  function clearErrors() {
    const el = $('#accError');
    el.textContent = '';
    el.hidden = true;
    el.classList.remove('ok');
    $$('.account-box input').forEach(i => i.classList.remove('invalid'));
  }
  function fail(msg, field) {
    const el = $('#accError');
    el.textContent = msg;
    el.hidden = false;
    el.classList.remove('ok');
    if (field) { $(field).classList.add('invalid'); $(field).focus(); }
  }
  function info(msg) {
    const el = $('#accError');
    el.textContent = msg;
    el.hidden = false;
    el.classList.add('ok');
  }

  function friendlyError(err) {
    const e = (err || '').toLowerCase();
    if (e.includes('invalid login') || e.includes('credentials')) return 'Incorrect email or password. Try again.';
    if (e.includes('not confirmed') || e.includes('confirm')) return 'Please confirm your email first (check your inbox), then sign in.';
    if (e.includes('already registered') || e.includes('exists')) return 'An account with this email already exists. Sign in instead.';
    if (e.includes('password')) return 'Password is too weak — Supabase requires at least 6 characters.';
    if (e.includes('email logins are disabled')) return 'Email sign-in is disabled on the store account.';
    return err || 'Something went wrong. Please try again.';
  }

  $('#accountForm').addEventListener('submit', async e => {
    e.preventDefault();
    clearErrors();
    const email = $('#accEmail').value.trim().toLowerCase();
    const pass = $('#accPass').value;
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
    const btn = $('#authSubmit');
    const original = btn.innerHTML;

    if (!emailRe.test(email)) return fail('Enter a valid email address.', '#accEmail');
    if (pass.length < 8 || !/[A-Za-z]/.test(pass) || !/\d/.test(pass))
      return fail('Password must be at least 8 characters and contain a letter and a number.', '#accPass');

    btn.disabled = true;
    btn.textContent = 'PLEASE WAIT…';

    if (authMode === 'signup') {
      const name = $('#accName').value.trim();
      if (name.length < 2) { btn.disabled = false; btn.innerHTML = original; return fail('Enter your full name (at least 2 characters).', '#accName'); }
      if (pass !== $('#accConfirm').value) { btn.disabled = false; btn.innerHTML = original; return fail('Passwords do not match.', '#accConfirm'); }

      const { data, error } = await sb('/auth/v1/signup', {
        method: 'POST', body: { email, password: pass, data: { name } }
      });
      btn.disabled = false;
      btn.innerHTML = original;
      if (error) return fail(friendlyError(error), error.toLowerCase().includes('registered') ? '#accEmail' : '#accPass');

      if (data.session) {
        saveSession(data.session);
        showToast(`Account created — welcome, ${name.split(' ')[0]}! 🎉`);
        updateAccountUI();
        openAccount('dash');
      } else {
        info('Account created. Check your email to confirm it, then sign in here.');
      }
    } else {
      const { data, error } = await sb('/auth/v1/token?grant_type=password', {
        method: 'POST', body: { email, password: pass }
      });
      btn.disabled = false;
      btn.innerHTML = original;
      if (error || !data?.access_token) return fail(error ? friendlyError(error) : 'Could not sign in.', '#accPass');

      saveSession(data);
      const name = (data.user?.user_metadata?.name || email.split('@')[0]).split(' ')[0];
      showToast(`Welcome back, ${name}! ✅`);
      updateAccountUI();
      openAccount('dash');
    }
  });

  /* ---------- dashboard ---------- */
  function renderDashboard() {
    const user = currentUser();
    if (!user) return;
    $('#accNameOut').textContent = user.name.toUpperCase();
    $('#accEmailOut').textContent = user.email;
    $('#accAvatar').textContent = user.name.trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
    $('#accOrdersCount').textContent = user.orders.length;
    $('#accSavedCount').textContent = user.saved.length;

    const ordersEl = $('#accOrdersList');
    ordersEl.innerHTML = user.orders.length
      ? user.orders.slice().reverse().map(o => `
        <div class="acc-row">
          <div class="ar-info">
            <strong>${o.id} · ${money(o.total)}</strong>
            <span>${o.date} · ${o.items} item${o.items === 1 ? '' : 's'}</span>
          </div>
          <button data-reorder="${o.id}">REORDER</button>
        </div>`).join('')
      : '<p class="acc-empty">No orders yet — your first one is waiting.</p>';

    const savedEl = $('#accSavedList');
    savedEl.innerHTML = user.saved.length
      ? user.saved.map(id => {
          const p = $$('.quick-add').find(b => b.dataset.id === id);
          if (!p) return '';
          return `
          <div class="acc-row">
            <img src="${p.dataset.img}" alt="">
            <div class="ar-info"><strong>${p.dataset.name}</strong><span>${money(parseFloat(p.dataset.price))}</span></div>
            <button data-unsave="${id}">REMOVE</button>
            <button data-saveadd="${id}">ADD</button>
          </div>`;
        }).join('')
      : '<p class="acc-empty">Tap the ♡ on a product to save it here.</p>';

    $$('[data-reorder]', ordersEl).forEach(b => b.addEventListener('click', () => {
      const order = user.orders.find(o => o.id === b.dataset.reorder);
      order.products.forEach(p => addToCart(p, p.qty));
      closeAccount();
      showToast('Items added back to your bag 💪');
      openCart();
    }));
    $$('[data-unsave]', savedEl).forEach(async b => {
      const next = user.saved.filter(id => id !== b.dataset.unsave);
      if (await updateProfile({ saved: next })) { updateAccountUI(); renderDashboard(); }
    });
    $$('[data-saveadd]', savedEl).forEach(b => {
      const p = $$('.quick-add').find(x => x.dataset.id === b.dataset.saveadd);
      addToCart(p.dataset);
      showToast('Added to your bag 💪');
    });
  }

  $('#logoutBtn').addEventListener('click', async () => {
    if (sbSession?.access_token) {
      await sb('/auth/v1/logout', { method: 'POST', token: sbSession.access_token });
    }
    saveSession(null);
    updateAccountUI();
    setAuthMode('signin');
    openAccount('auth');
    showToast('You have been signed out.');
  });

  /* ---------- wishlist hearts ---------- */
  function updateAccountUI() {
    const user = currentUser();
    const admin = isAdmin();
    $('#adminBtn').hidden = !admin;
    $('#openAdminBtn').hidden = !admin;
    $$('.save-btn').forEach(btn => {
      const saved = !!user && user.saved.includes(btn.dataset.id);
      btn.classList.toggle('saved', saved);
      btn.textContent = saved ? '♥' : '♡';
      btn.title = user ? 'Save to my list' : 'Sign in to save';
    });
    renderCart();
  }

  function initProductCards(list) {
    list.forEach(card => {
      if (card.dataset.ready) return;
      card.dataset.ready = '1';
      const qa = $('.quick-add', card);
      if (!qa) return;
      const btn = document.createElement('button');
      btn.className = 'save-btn';
      btn.dataset.id = qa.dataset.id;
      btn.setAttribute('aria-label', 'Save product');
      btn.textContent = '♡';
      btn.addEventListener('click', async e => {
        e.stopPropagation();
        const user = currentUser();
        if (!user) return openAccount('auth', 'Sign in to save products and unlock member pricing.');
        const id = btn.dataset.id;
        const saved = user.saved.includes(id);
        const next = saved ? user.saved.filter(x => x !== id) : [...user.saved, id];
        if (await updateProfile({ saved: next })) {
          updateAccountUI();
          showToast(saved ? 'Removed from your list' : 'Saved to your list ♥');
        }
      });
      $('.product-media', card).appendChild(btn);
    });
  }
  initProductCards(cards);

  /* ---------- add to bag ---------- */
  function initQuickAdd(list) {
    list.forEach(btn => {
      if (btn.dataset.ready) return;
      btn.dataset.ready = '1';
      btn.addEventListener('click', () => {
        addToCart(btn.dataset);
        showToast(`Added — ${btn.dataset.name} 💪`);
        btn.classList.add('added');
        btn.textContent = 'ADDED ✓';
        setTimeout(() => {
          btn.classList.remove('added');
          btn.textContent = 'ADD TO BAG +';
        }, 1400);
      });
    });
  }
  initQuickAdd($$('.quick-add'));

  /* ---------- checkout (members only) ---------- */
  $('#checkoutBtn').addEventListener('click', async () => {
    const user = currentUser();
    if (!user) return openAccount('auth', 'Sign in to complete your order and get 10% off.');
    if (!cart.length) { showToast('Your bag is empty — add something first.'); return; }

    const sub = cart.reduce((s, i) => s + i.qty * i.price, 0);
    const rate = discountPercent() / 100;
    const discount = Math.round(sub * rate * 100) / 100;
    const total = Math.round((sub - discount) * 100) / 100;
    const order = {
      id: 'AZ-' + Date.now().toString(36).toUpperCase(),
      date: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
      items: cart.reduce((s, i) => s + i.qty, 0),
      total,
      products: cart.map(i => ({ ...i }))
    };
    const ok = await updateProfile({ orders: [...user.orders, order] });
    if (!ok) return showToast('Could not save your order. Please try again.');

    /* also write to the shared orders table so admin can see it */
    const { error: orderErr } = await sb(`${REST}/orders`, {
      method: 'POST', token: sbSession.access_token, prefer: 'return=minimal',
      body: {
        id: order.id,
        user_id: sbSession.user.id,
        email: user.email,
        customer_name: user.name,
        items: order.products,
        subtotal: sub,
        discount,
        discount_code: memberDiscount?.code || null,
        total,
        status: 'New'
      }
    });
    if (orderErr) console.warn('Shared order log unavailable:', orderErr);

    cart.length = 0;
    renderCart();
    closeCart();
    showToast('Order placed! Aziz will contact you shortly ✅');
    if (accModal.classList.contains('open')) renderDashboard();
  });

  /* ============================================================
     SHARED STORE DATA — Supabase tables with static fallbacks
     ============================================================ */
  const categoryImages = {
    creatine: 'images/creatine.png',
    preworkout: 'images/abe.webp',
    vitamins: 'images/d3.png',
    health: 'images/omega.jpg'
  };

  function tagClass(tag) {
    const t = String(tag || '').toLowerCase();
    if (t.includes('new')) return 'tag-new';
    if (t.startsWith('-') || t.includes('sale') || t.includes('%')) return 'tag-sale';
    return 'tag-hot';
  }

  function productCardHTML(p) {
    const img = p.img || 'images/creatine.png';
    const tag = String(p.tag || '').trim();
    return `
      <article class="product-card reveal" data-cat="${esc(p.category)}" data-name="${esc(p.name + ' ' + (p.brand || ''))}">
        <div class="product-media">
          ${tag ? `<span class="tag ${tagClass(tag)}">${esc(tag)}</span>` : ''}
          <img src="${esc(img)}" alt="${esc(p.name)}">
          <button class="quick-add" data-id="${esc(p.id)}" data-name="${esc(p.name)}" data-price="${Number(p.price) || 0}" data-img="${esc(img)}">ADD TO BAG +</button>
        </div>
        <div class="product-info">
          <p class="product-brand">${esc((p.brand || 'AZ NUTRITION').toUpperCase())}</p>
          <h3 class="product-name">${esc(p.name)}</h3>
          <div class="product-meta">
            <span class="price">${money(p.price)}</span>
            <span class="stars" aria-label="5 out of 5">★★★★★</span>
          </div>
          ${p.description ? `<p class="product-desc">${esc(p.description)}</p>` : ''}
        </div>
      </article>`;
  }

  function renderDynamicProducts(list) {
    $('#productGrid').innerHTML = list.map(productCardHTML).join('');
    cards = $$('.product-card');
    filterBtns = $$('.filter-btn');
    filterBtns.forEach(b => b.addEventListener('click', () => setFilter(b.dataset.filter)));
    initProductCards(cards);
    initQuickAdd($$('.quick-add'));
    applyFilters();
    $$('.reveal', $('#productGrid')).forEach(el => io.observe(el));
  }

  function renderDynamicCategories(list) {
    const keep = list.some(c => c.id === activeCat) ? activeCat : 'all';
    $('#filters').innerHTML = `<button class="filter-btn${keep === 'all' ? ' active' : ''}" data-filter="all">ALL</button>` +
      list.map(c => `<button class="filter-btn${keep === c.id ? ' active' : ''}" data-filter="${esc(c.id)}">${esc(c.label.toUpperCase())}</button>`).join('');

    $('#catGrid').innerHTML = list.map(c => {
      const img = c.img || categoryImages[c.id] || 'images/creatine.png';
      return `
        <a href="#products" class="cat-card reveal" data-filter-link="${esc(c.id)}">
          <img src="${esc(img)}" alt="${esc(c.label)}">
          <div class="cat-overlay"><h3>${esc(c.label.toUpperCase())}</h3><span class="cat-arrow">↗</span></div>
        </a>`;
    }).join('');

    $$('[data-filter-link]').forEach(link => {
      const cat = list.find(c => c.id === link.dataset.filterLink);
      if (!cat) return;
      if (link.closest('.nav') || link.closest('.cat-card')) link.textContent = cat.label.toUpperCase();
      else if (!link.closest('#filters')) link.textContent = cat.label;
    });

    filterBtns = $$('.filter-btn');
    filterBtns.forEach(b => b.addEventListener('click', () => setFilter(b.dataset.filter)));
    bindFilterLinks();
    setFilter(keep);
    $$('.reveal', $('#catGrid')).forEach(el => io.observe(el));
  }

  function applySiteText(map) {
    const set = (sel, value, html = false) => {
      if (value == null) return;
      const el = $(sel);
      if (!el) return;
      if (html) el.innerHTML = value;
      else el.textContent = value;
    };
    set('#heroTitle', map.heroTitle, true);
    set('#heroSub', map.heroSub);
    set('#promoText', map.promoText, true);
    set('#newsTitle', map.newsTitle);
    set('#newsText', map.newsText);
  }

  function updateDiscountUI() {
    const pct = memberDiscount ? Number(memberDiscount.percent) || 0 : 0;
    const pp = $('#promoPercent');
    if (pp) pp.textContent = pct + '%';
    const pc = $('#promoCode');
    if (pc) {
      pc.textContent = memberDiscount?.code || '—';
      pc.hidden = !memberDiscount?.code;
    }
    renderCart();
  }

  async function fetchRows(table, query, token) {
    const { data, error } = await sb(`${REST}/${table}?${query}`, { token });
    return { data: Array.isArray(data) ? data : [], error };
  }

  let loadingStore = false;
  async function loadStoreData() {
    if (loadingStore) return;
    loadingStore = true;
    const admin = isAdmin();
    const token = sbSession?.access_token;

    try {
      const [pubProducts, pubCats, pubDiscounts, textRes, allProducts, allCats, allDiscounts, ordersRes] = await Promise.all([
        fetchRows('products', 'select=*&active=eq.true&order=sort.asc,created_at.asc', token),
        fetchRows('categories', 'select=*&active=eq.true&order=sort.asc', token),
        fetchRows('discounts', 'select=*&active=eq.true&order=created_at.asc', token),
        sb(`${REST}/site_text?select=key,value`),
        admin ? fetchRows('products', 'select=*&order=sort.asc,created_at.asc', token) : null,
        admin ? fetchRows('categories', 'select=*&order=sort.asc', token) : null,
        admin ? fetchRows('discounts', 'select=*&order=created_at.asc', token) : null,
        admin ? fetchRows('orders', 'select=*&order=created_at.desc', token) : null
      ]);

      if (!pubProducts.error) {
        storeData.products = pubProducts.data;
        loaded.products = true;
        if (pubProducts.data.length) renderDynamicProducts(pubProducts.data);
      }
      if (!pubCats.error) {
        storeData.categories = pubCats.data;
        loaded.categories = true;
        if (pubCats.data.length) renderDynamicCategories(pubCats.data);
      }
      if (!pubDiscounts.error) {
        storeData.discounts = pubDiscounts.data;
        loaded.discounts = true;
        memberDiscount = pubDiscounts.data[0] || null;
      }
      if (!textRes.error && Array.isArray(textRes.data)) {
        storeData.siteText = Object.fromEntries(textRes.data.map(r => [r.key, r.value]));
        loaded.siteText = true;
        applySiteText(storeData.siteText);
      }

      if (admin) {
        storeData.allProducts = allProducts?.error ? [] : (allProducts?.data || []);
        storeData.allCategories = allCats?.error ? [] : (allCats?.data || []);
        storeData.allDiscounts = allDiscounts?.error ? [] : (allDiscounts?.data || []);
        storeData.orders = ordersRes?.error ? [] : (ordersRes?.data || []);
        loaded.orders = !ordersRes?.error;
      }

      updateDiscountUI();
      renderAdminView();
    } finally {
      loadingStore = false;
    }
  }

  /* ============================================================
     ADMIN DASHBOARD
     ============================================================ */
  const adminPanel = $('#adminPanel');
  let adminTab = 'overview';
  const orderStatuses = ['New', 'Processing', 'Shipped', 'Delivered', 'Cancelled'];

  function adminStatus(sel, msg, error = false) {
    const el = $(sel);
    if (!el) return;
    el.textContent = msg || '';
    el.classList.toggle('error', !!error);
  }

  function openAdmin() {
    if (!isAdmin()) return showToast('Admin access only.');
    adminPanel.classList.add('open');
    document.body.style.overflow = 'hidden';
    switchAdminTab('overview');
    loadStoreData();
  }
  function closeAdmin() {
    adminPanel.classList.remove('open');
    document.body.style.overflow = '';
  }
  $('#adminBtn').addEventListener('click', openAdmin);
  $('#openAdminBtn').addEventListener('click', () => { closeAccount(); openAdmin(); });
  $('#adminClose').addEventListener('click', closeAdmin);
  adminPanel.addEventListener('click', e => { if (e.target === adminPanel) closeAdmin(); });

  function switchAdminTab(tab) {
    adminTab = tab;
    $$('#adminTabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    $$('[data-panel]', adminPanel).forEach(s => { s.hidden = s.dataset.panel !== tab; });
    renderAdminView();
  }
  $('#adminTabs').addEventListener('click', e => {
    const btn = e.target.closest('button[data-tab]');
    if (btn) switchAdminTab(btn.dataset.tab);
  });

  function renderAdminView() {
    if (!adminPanel.classList.contains('open')) return;
    if (adminTab === 'overview') renderAdminOverview();
    if (adminTab === 'products') renderAdminProducts();
    if (adminTab === 'discounts') renderAdminDiscounts();
    if (adminTab === 'orders') renderAdminOrders();
    if (adminTab === 'categories') renderAdminCategories();
    if (adminTab === 'settings') populateSiteForm();
  }

  function renderAdminOverview() {
    $('#adStatProducts').textContent = storeData.allProducts.length || storeData.products.length || 0;
    $('#adStatDiscounts').textContent = storeData.allDiscounts.length || storeData.discounts.length || 0;
    $('#adStatOrders').textContent = storeData.orders.length || 0;
    $('#adStatCategories').textContent = storeData.allCategories.length || storeData.categories.length || 0;
  }

  /* ---------- admin: products ---------- */
  function populateCategorySelect() {
    const sel = $('#pCategory');
    const cats = storeData.allCategories.length ? storeData.allCategories : storeData.categories;
    const list = cats.length ? cats : [{ id: 'creatine', label: 'CREATINE' }];
    sel.innerHTML = list.map(c => `<option value="${esc(c.id)}">${esc(c.label.toUpperCase())}</option>`).join('');
  }

  function resetProductForm() {
    $('#productForm').reset();
    $('#pEditId').value = '';
    $('#pId').disabled = false;
    $('#pActive').checked = true;
    $('#pCancelBtn').hidden = true;
    adminStatus('#pStatus', '');
    adminStatus('#pUploadStatus', 'Uploads go to the public “products” bucket.');
    populateCategorySelect();
  }

  function renderAdminProducts() {
    const list = storeData.allProducts.length ? storeData.allProducts : storeData.products;
    $('#productCount').textContent = list.length;
    $('#productList').innerHTML = list.length ? list.map(p => `
      <div class="admin-item ${p.active ? '' : 'inactive'}">
        <img src="${esc(p.img || 'images/creatine.png')}" alt="">
        <div class="ai-info">
          <strong>${esc(p.name)}</strong>
          <span>${esc(p.id)} · ${esc(p.category)} · ${money(p.price)}${p.active ? '' : ' · HIDDEN'}</span>
        </div>
        <div class="ai-actions">
          <button data-edit-product="${esc(p.id)}">EDIT</button>
          <button class="danger" data-delete-product="${esc(p.id)}">DELETE</button>
        </div>
      </div>`).join('') : '<p class="admin-empty">No products yet. Add one with the form above.</p>';
    populateCategorySelect();
  }

  function editProduct(id) {
    const list = storeData.allProducts.length ? storeData.allProducts : storeData.products;
    const p = list.find(x => x.id === id);
    if (!p) return;
    populateCategorySelect();
    $('#pEditId').value = p.id;
    $('#pId').value = p.id;
    $('#pId').disabled = true;
    $('#pName').value = p.name || '';
    $('#pBrand').value = p.brand || '';
    $('#pCategory').value = p.category || 'creatine';
    if (!$('#pCategory').value) $('#pCategory').value = 'creatine';
    $('#pPrice').value = p.price ?? '';
    $('#pSort').value = p.sort ?? 0;
    $('#pImg').value = p.img || '';
    $('#pTag').value = p.tag || '';
    $('#pDesc').value = p.description || '';
    $('#pActive').checked = p.active !== false;
    $('#pCancelBtn').hidden = false;
    adminStatus('#pStatus', `Editing product “${p.id}”.`);
    $('#productForm').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  async function uploadProductImage(file, statusSel) {
    if (!sbSession?.access_token) return adminStatus(statusSel, 'Sign in as admin before uploading.', true);
    const base = (file.name.replace(/\.[^.]+$/, '') || 'image').replace(/[^a-z0-9_-]/gi, '-').slice(0, 40);
    const ext = (file.name.split('.').pop() || 'png').toLowerCase();
    const path = `${Date.now()}-${base}.${ext}`;
    adminStatus(statusSel, 'Uploading image…');
    const res = await fetch(`${SB_URL}/storage/v1/object/products/${encodeURIComponent(path)}`, {
      method: 'POST',
      headers: {
        apikey: SB_KEY,
        Authorization: `Bearer ${sbSession.access_token}`,
        'Content-Type': file.type || 'application/octet-stream',
        'x-upsert': 'true'
      },
      body: file
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      adminStatus(statusSel, data.message || 'Upload failed. Create the “products” bucket by running supabase-setup.sql.', true);
      return null;
    }
    const url = `${SB_URL}/storage/v1/object/public/products/${path}`;
    $('#pImg').value = url;
    adminStatus(statusSel, 'Uploaded — URL filled in above.');
    return url;
  }

  $('#pFile').addEventListener('change', e => {
    const file = e.target.files?.[0];
    if (file) uploadProductImage(file, '#pUploadStatus');
  });
  $('#pCancelBtn').addEventListener('click', resetProductForm);

  $('#productForm').addEventListener('submit', async e => {
    e.preventDefault();
    const name = $('#pName').value.trim();
    const price = parseFloat($('#pPrice').value);
    if (!name) return adminStatus('#pStatus', 'Product name is required.', true);
    if (!isFinite(price) || price < 0) return adminStatus('#pStatus', 'Enter a valid price.', true);

    let img = $('#pImg').value.trim();
    const file = $('#pFile').files?.[0];
    if (file) {
      img = await uploadProductImage(file, '#pUploadStatus');
      if (!img) return;
    }

    const editId = $('#pEditId').value;
    const id = (editId || $('#pId').value.trim()).toLowerCase().replace(/[^a-z0-9_-]/g, '-');
    if (!id) return adminStatus('#pStatus', 'Product ID is required.', true);

    const row = {
      id, name, price,
      brand: $('#pBrand').value.trim(),
      category: $('#pCategory').value,
      img: img || 'images/creatine.png',
      tag: $('#pTag').value.trim(),
      description: $('#pDesc').value.trim(),
      active: $('#pActive').checked,
      sort: parseInt($('#pSort').value, 10) || 0
    };
    adminStatus('#pStatus', 'Saving…');
    const { error } = await sb(`${REST}/products${editId ? '?id=eq.' + encodeURIComponent(editId) : ''}`, {
      method: editId ? 'PATCH' : 'POST', token: sbSession.access_token,
      prefer: 'return=minimal', body: row
    });
    if (error) return adminStatus('#pStatus', error, true);
    adminStatus('#pStatus', editId ? 'Product updated.' : 'Product added.');
    resetProductForm();
    await loadStoreData();
    showToast(editId ? 'Product updated ✅' : 'Product added ✅');
  });

  $('#productList').addEventListener('click', async e => {
    const edit = e.target.closest('[data-edit-product]')?.dataset.editProduct;
    const del = e.target.closest('[data-delete-product]')?.dataset.deleteProduct;
    if (edit) return editProduct(edit);
    if (del && confirm(`Delete product “${del}”?`)) {
      const { error } = await sb(`${REST}/products?id=eq.${encodeURIComponent(del)}`, {
        method: 'DELETE', token: sbSession.access_token, prefer: 'return=minimal'
      });
      if (error) return showToast('Delete failed: ' + error);
      showToast('Product deleted.');
      await loadStoreData();
    }
  });

  /* ---------- admin: discounts ---------- */
  function resetDiscountForm() {
    $('#discountForm').reset();
    $('#dEditCode').value = '';
    $('#dCode').disabled = false;
    $('#dActive').checked = true;
    $('#dCancelBtn').hidden = true;
    adminStatus('#dStatus', '');
  }

  function renderAdminDiscounts() {
    const list = storeData.allDiscounts.length ? storeData.allDiscounts : storeData.discounts;
    $('#discountCount').textContent = list.length;
    $('#discountList').innerHTML = list.length ? list.map(d => `
      <div class="admin-item ${d.active ? '' : 'inactive'}">
        <div class="ai-info">
          <strong>${esc(d.code)} — ${Number(d.percent)}% OFF</strong>
          <span>${esc(d.note || 'No note')}${d.active ? '' : ' · INACTIVE'}</span>
        </div>
        <div class="ai-actions">
          <button data-edit-discount="${esc(d.code)}">EDIT</button>
          <button class="danger" data-delete-discount="${esc(d.code)}">DELETE</button>
        </div>
      </div>`).join('') : '<p class="admin-empty">No discount codes yet.</p>';
  }

  $('#dCancelBtn').addEventListener('click', resetDiscountForm);
  $('#discountForm').addEventListener('submit', async e => {
    e.preventDefault();
    const editCode = $('#dEditCode').value;
    const code = (editCode || $('#dCode').value.trim()).toUpperCase().replace(/\s+/g, '-');
    const percent = parseInt($('#dPercent').value, 10);
    if (!code) return adminStatus('#dStatus', 'Discount code is required.', true);
    if (!isFinite(percent) || percent < 1 || percent > 100) return adminStatus('#dStatus', 'Percent must be between 1 and 100.', true);
    adminStatus('#dStatus', 'Saving…');
    const { error } = await sb(`${REST}/discounts${editCode ? '?code=eq.' + encodeURIComponent(editCode) : ''}`, {
      method: editCode ? 'PATCH' : 'POST', token: sbSession.access_token,
      prefer: 'return=minimal',
      body: { code, percent, note: $('#dNote').value.trim(), active: $('#dActive').checked }
    });
    if (error) return adminStatus('#dStatus', error, true);
    adminStatus('#dStatus', editCode ? 'Discount updated.' : 'Discount added.');
    resetDiscountForm();
    await loadStoreData();
    showToast('Discount saved ✅');
  });

  $('#discountList').addEventListener('click', async e => {
    const edit = e.target.closest('[data-edit-discount]')?.dataset.editDiscount;
    const del = e.target.closest('[data-delete-discount]')?.dataset.deleteDiscount;
    if (edit) {
      const d = [...storeData.allDiscounts, ...storeData.discounts].find(x => x.code === edit);
      if (!d) return;
      $('#dEditCode').value = d.code;
      $('#dCode').value = d.code;
      $('#dCode').disabled = true;
      $('#dPercent').value = d.percent;
      $('#dNote').value = d.note || '';
      $('#dActive').checked = d.active !== false;
      $('#dCancelBtn').hidden = false;
      adminStatus('#dStatus', `Editing discount “${d.code}”.`);
      return;
    }
    if (del && confirm(`Delete discount “${del}”?`)) {
      const { error } = await sb(`${REST}/discounts?code=eq.${encodeURIComponent(del)}`, {
        method: 'DELETE', token: sbSession.access_token, prefer: 'return=minimal'
      });
      if (error) return showToast('Delete failed: ' + error);
      showToast('Discount deleted.');
      await loadStoreData();
    }
  });

  /* ---------- admin: orders ---------- */
  function renderAdminOrders() {
    const list = storeData.orders;
    $('#orderList').innerHTML = list.length ? list.map(o => {
      const date = o.created_at ? new Date(o.created_at).toLocaleString('en-GB', {
        day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
      }) : '—';
      const items = Array.isArray(o.items) ? o.items : [];
      return `
      <div class="order-wrap">
        <div class="order-row">
          <div class="oi-main">
            <strong>${esc(o.id)} · ${esc(o.customer_name || o.email)}</strong>
            <span>${esc(date)} · ${esc(o.email)} · ${items.length} item${items.length === 1 ? '' : 's'}</span>
          </div>
          <span class="oi-total">${money(o.total)}</span>
          <select data-order-status="${esc(o.id)}" aria-label="Order status">
            ${orderStatuses.map(s => `<option value="${s}"${o.status === s ? ' selected' : ''}>${s}</option>`).join('')}
          </select>
          <button data-order-detail="${esc(o.id)}">DETAILS</button>
        </div>
        <div class="order-detail" hidden>
          <div><strong>${esc(o.discount_code || 'No code')}</strong> · Status: <strong>${esc(o.status || 'New')}</strong></div>
          <ul>${items.map(i => `<li><span>${esc(i.name)} × ${Number(i.qty) || 1}</span><span>${money((Number(i.price) || 0) * (Number(i.qty) || 1))}</span></li>`).join('') || '<li>No items</li>'}</ul>
          <div class="od-lines">
            <span>SUBTOTAL <b>${money(o.subtotal)}</b></span>
            <span>DISCOUNT <b>${money(o.discount)}</b></span>
            <span>TOTAL <b>${money(o.total)}</b></span>
          </div>
        </div>
      </div>`;
    }).join('') : '<p class="admin-empty">No orders yet. Orders placed by members will appear here.</p>';
  }

  $('#orderList').addEventListener('click', e => {
    const btn = e.target.closest('[data-order-detail]');
    if (!btn) return;
    const detail = btn.closest('.order-wrap')?.querySelector('.order-detail');
    if (!detail) return;
    detail.hidden = !detail.hidden;
    btn.textContent = detail.hidden ? 'DETAILS' : 'HIDE';
  });
  $('#orderList').addEventListener('change', async e => {
    const sel = e.target.closest('[data-order-status]');
    if (!sel) return;
    const { error } = await sb(`${REST}/orders?id=eq.${encodeURIComponent(sel.dataset.orderStatus)}`, {
      method: 'PATCH', token: sbSession.access_token, prefer: 'return=minimal',
      body: { status: sel.value }
    });
    if (error) {
      showToast('Status update failed: ' + error);
      renderAdminOrders();
    } else showToast('Order status updated.');
  });
  $('#orderReload').addEventListener('click', () => loadStoreData());
  $('#adReload').addEventListener('click', () => loadStoreData());
  $('#adGoOrders').addEventListener('click', () => switchAdminTab('orders'));

  /* ---------- admin: categories ---------- */
  function resetCategoryForm() {
    $('#categoryForm').reset();
    $('#cEditId').value = '';
    $('#cId').disabled = false;
    $('#cActive').checked = true;
    $('#cCancelBtn').hidden = true;
    adminStatus('#cStatus', '');
  }

  function renderAdminCategories() {
    const list = storeData.allCategories.length ? storeData.allCategories : storeData.categories;
    $('#categoryCount').textContent = list.length;
    $('#categoryList').innerHTML = list.length ? list.map(c => `
      <div class="admin-item ${c.active ? '' : 'inactive'}">
        <img src="${esc(c.img || 'images/creatine.png')}" alt="">
        <div class="ai-info">
          <strong>${esc(c.label)}</strong>
          <span>${esc(c.id)} · sort ${Number(c.sort) || 0}${c.active ? '' : ' · HIDDEN'}</span>
        </div>
        <div class="ai-actions">
          <button data-edit-cat="${esc(c.id)}">EDIT</button>
          <button class="danger" data-delete-cat="${esc(c.id)}">DELETE</button>
        </div>
      </div>`).join('') : '<p class="admin-empty">No categories yet.</p>';
  }

  $('#cCancelBtn').addEventListener('click', resetCategoryForm);
  $('#categoryForm').addEventListener('submit', async e => {
    e.preventDefault();
    const editId = $('#cEditId').value;
    const id = (editId || $('#cId').value.trim()).toLowerCase().replace(/[^a-z0-9_-]/g, '-');
    const label = $('#cLabel').value.trim();
    if (!id || !label) return adminStatus('#cStatus', 'Category ID and label are required.', true);
    adminStatus('#cStatus', 'Saving…');
    const { error } = await sb(`${REST}/categories${editId ? '?id=eq.' + encodeURIComponent(editId) : ''}`, {
      method: editId ? 'PATCH' : 'POST', token: sbSession.access_token,
      prefer: 'return=minimal',
      body: {
        id, label, img: $('#cImg').value.trim(),
        active: $('#cActive').checked,
        sort: parseInt($('#cSort').value, 10) || 0
      }
    });
    if (error) return adminStatus('#cStatus', error, true);
    adminStatus('#cStatus', editId ? 'Category updated.' : 'Category added.');
    resetCategoryForm();
    await loadStoreData();
    showToast('Category saved ✅');
  });

  $('#categoryList').addEventListener('click', async e => {
    const edit = e.target.closest('[data-edit-cat]')?.dataset.editCat;
    const del = e.target.closest('[data-delete-cat]')?.dataset.deleteCat;
    if (edit) {
      const c = [...storeData.allCategories, ...storeData.categories].find(x => x.id === edit);
      if (!c) return;
      $('#cEditId').value = c.id;
      $('#cId').value = c.id;
      $('#cId').disabled = true;
      $('#cLabel').value = c.label;
      $('#cImg').value = c.img || '';
      $('#cSort').value = c.sort ?? 0;
      $('#cActive').checked = c.active !== false;
      $('#cCancelBtn').hidden = false;
      adminStatus('#cStatus', `Editing category “${c.id}”.`);
      return;
    }
    if (del && confirm(`Delete category “${del}”?`)) {
      const { error } = await sb(`${REST}/categories?id=eq.${encodeURIComponent(del)}`, {
        method: 'DELETE', token: sbSession.access_token, prefer: 'return=minimal'
      });
      if (error) return showToast('Delete failed: ' + error);
      showToast('Category deleted.');
      await loadStoreData();
    }
  });

  /* ---------- admin: site text ---------- */
  function populateSiteForm() {
    const t = storeData.siteText;
    $('#sHeroTitle').value = t.heroTitle || '';
    $('#sHeroSub').value = t.heroSub || '';
    $('#sPromoText').value = t.promoText || '';
    $('#sNewsTitle').value = t.newsTitle || '';
    $('#sNewsText').value = t.newsText || '';
  }

  $('#siteForm').addEventListener('submit', async e => {
    e.preventDefault();
    const rows = [
      { key: 'heroTitle', value: $('#sHeroTitle').value },
      { key: 'heroSub', value: $('#sHeroSub').value },
      { key: 'promoText', value: $('#sPromoText').value },
      { key: 'newsTitle', value: $('#sNewsTitle').value },
      { key: 'newsText', value: $('#sNewsText').value }
    ];
    adminStatus('#sStatus', 'Saving…');
    const { error } = await sb(`${REST}/site_text`, {
      method: 'POST', token: sbSession.access_token,
      prefer: 'resolution=merge-duplicates,return=minimal', body: rows
    });
    if (error) return adminStatus('#sStatus', error, true);
    adminStatus('#sStatus', 'Site text updated.');
    await loadStoreData();
    showToast('Site text updated ✅');
  });

  /* ---------- restore session ---------- */
  (async () => {
    if (sbSession && sbSession.expires_at < Date.now() + 60000) await refreshSession();
    updateAccountUI();
  })();

  /* ---------- newsletter ---------- */
  $('#newsForm').addEventListener('submit', e => {
    e.preventDefault();
    const email = $('#newsEmail');
    if (!email.value.trim()) return;
    $('#newsSuccess').hidden = false;
    email.value = '';
    showToast('Welcome to the movement! 🎉');
  });

  /* ---------- scroll reveal ---------- */
  const io = new IntersectionObserver(entries => {
    entries.forEach(en => {
      if (en.isIntersecting) {
        en.target.classList.add('in');
        io.unobserve(en.target);
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
  $$('.reveal').forEach(el => io.observe(el));

  /* load shared store data last, after all UI handlers are ready */
  loadStoreData();
})();
