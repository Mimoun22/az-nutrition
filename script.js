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
  const cards = $$('.product-card');
  const filterBtns = $$('.filter-btn');
  const noResults = $('#noResults');
  let activeCat = 'all';

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
  $$('[data-filter-link]').forEach(link => {
    link.addEventListener('click', () => setFilter(link.dataset.filterLink));
  });

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
     ACCOUNTS  (localStorage — demo, no server)
     Stored: name, email, password hash, saved[], orders[]
     ============================================================ */
  const USERS_KEY = 'az_users_v1';
  const SESSION_KEY = 'az_session_v1';
  const money = n => '$' + n.toFixed(2);
  const hash = s => {
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
    return h.toString(16);
  };

  function loadUsers() {
    try { return JSON.parse(localStorage.getItem(USERS_KEY)) || []; }
    catch { return []; }
  }
  let users = loadUsers();
  let sessionEmail = localStorage.getItem(SESSION_KEY) || null;
  const currentUser = () => users.find(u => u.email === sessionEmail) || null;
  const persist = () => {
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
    if (sessionEmail) localStorage.setItem(SESSION_KEY, sessionEmail);
    else localStorage.removeItem(SESSION_KEY);
  };

  /* Universal shared demo account — works on every device.
     Accounts created by visitors stay on their own device (no server). */
  const DEMO_EMAIL = 'demo@aznutrition.com';
  const DEMO_PASS = 'AZdemo123';
  if (!users.some(u => u.email === DEMO_EMAIL)) {
    users.push({
      name: 'AZ Demo Member', email: DEMO_EMAIL, pass: hash(DEMO_PASS),
      saved: ['p1', 'p4'],
      orders: [{
        id: 'AZ-DEMO001', date: '12 Nov 2026', items: 2, total: 62.13,
        products: [
          { id: 'p1', name: 'Micronised Creatine Monohydrate 634g', price: 34.99, img: 'images/creatine.png', qty: 1 },
          { id: 'p4', name: 'Superset Pre-Workout — Blue Freeze', price: 36.99, img: 'images/superset.webp', qty: 1 }
        ]
      }]
    });
    persist();
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

  function renderCart() {
    const user = currentUser();
    const count = cart.reduce((s, i) => s + i.qty, 0);
    const sub = cart.reduce((s, i) => s + i.qty * i.price, 0);
    const saving = user ? sub * 0.1 : 0;
    const total = sub - saving;

    $('#cartCount').textContent = count;
    $('#cartHeadCount').textContent = `(${count})`;
    $('#cartSub').textContent = money(sub);
    $('#cartTotal').textContent = money(total);
    $('#cartSaveRow').hidden = !user;
    $('#cartSave').textContent = `−${money(saving)}`;
    $('#cartNote').textContent = user
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
    $('#authIntro').textContent = 'Sign in to track orders, save products and unlock member pricing.';
  }
  $('#accountBtn').addEventListener('click', () => openAccount());
  $('#accountClose').addEventListener('click', closeAccount);
  $('#dashClose').addEventListener('click', closeAccount);
  accModal.addEventListener('click', e => { if (e.target === accModal) closeAccount(); });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { closeCart(); closeNav(); closeAccount(); }
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

  $('#useDemo').addEventListener('click', () => {
    if (authMode !== 'signin') setAuthMode('signin');
    clearErrors();
    $('#accEmail').value = DEMO_EMAIL;
    $('#accPass').value = DEMO_PASS;
    $('#accountForm').dispatchEvent(new Event('submit', { cancelable: true }));
  });

  function clearErrors() {
    $('#accError').hidden = true;
    $('#accError').textContent = '';
    $$('.account-box input').forEach(i => i.classList.remove('invalid'));
  }
  function fail(msg, field) {
    const el = $('#accError');
    el.textContent = msg;
    el.hidden = false;
    if (field) { $(field).classList.add('invalid'); $(field).focus(); }
  }

  $('#accountForm').addEventListener('submit', e => {
    e.preventDefault();
    clearErrors();
    const email = $('#accEmail').value.trim().toLowerCase();
    const pass = $('#accPass').value;
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

    if (!emailRe.test(email)) return fail('Enter a valid email address.', '#accEmail');

    if (authMode === 'signup') {
      const name = $('#accName').value.trim();
      if (name.length < 2) return fail('Enter your full name (at least 2 characters).', '#accName');
      if (users.some(u => u.email === email))
        return fail('An account with this email already exists. Sign in instead.', '#accEmail');
      if (pass.length < 8 || !/[A-Za-z]/.test(pass) || !/\d/.test(pass))
        return fail('Password must be at least 8 characters and contain a letter and a number.', '#accPass');
      if (pass !== $('#accConfirm').value)
        return fail('Passwords do not match.', '#accConfirm');

      users.push({ name, email, pass: hash(pass), saved: [], orders: [] });
      sessionEmail = email;
      persist();
      showToast(`Account created — welcome, ${name.split(' ')[0]}! 🎉`);
    } else {
      const user = users.find(u => u.email === email && u.pass === hash(pass));
      if (!user) return fail('Incorrect email or password. Try again or create an account.', '#accPass');
      sessionEmail = email;
      persist();
      showToast(`Welcome back, ${user.name.split(' ')[0]}! ✅`);
    }

    updateAccountUI();
    openAccount('dash');
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
    $$('[data-unsave]', savedEl).forEach(b => b.addEventListener('click', () => {
      user.saved = user.saved.filter(id => id !== b.dataset.unsave);
      persist(); updateAccountUI(); renderDashboard();
    }));
    $$('[data-saveadd]', savedEl).forEach(b => b.addEventListener('click', () => {
      const p = $$('.quick-add').find(x => x.dataset.id === b.dataset.saveadd);
      addToCart(p.dataset);
      showToast('Added to your bag 💪');
    }));
  }

  $('#logoutBtn').addEventListener('click', () => {
    sessionEmail = null;
    persist();
    updateAccountUI();
    setAuthMode('signin');
    openAccount('auth');
    showToast('You have been signed out.');
  });

  /* ---------- wishlist hearts ---------- */
  function updateAccountUI() {
    const user = currentUser();
    $$('.save-btn').forEach(btn => {
      btn.classList.toggle('saved', !!user && user.saved.includes(btn.dataset.id));
      btn.textContent = !!user && user.saved.includes(btn.dataset.id) ? '♥' : '♡';
      btn.title = user ? 'Save to my list' : 'Sign in to save';
    });
    renderCart();
  }

  cards.forEach(card => {
    const qa = $('.quick-add', card);
    if (!qa) return;
    const btn = document.createElement('button');
    btn.className = 'save-btn';
    btn.dataset.id = qa.dataset.id;
    btn.setAttribute('aria-label', 'Save product');
    btn.textContent = '♡';
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const user = currentUser();
      if (!user) return openAccount('auth', 'Sign in to save products and unlock member pricing.');
      const id = btn.dataset.id;
      const i = user.saved.indexOf(id);
      if (i === -1) { user.saved.push(id); showToast('Saved to your list ♥'); }
      else { user.saved.splice(i, 1); showToast('Removed from your list'); }
      persist();
      updateAccountUI();
    });
    $('.product-media', card).appendChild(btn);
  });

  /* ---------- add to bag ---------- */
  $$('.quick-add').forEach(btn => {
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

  /* ---------- checkout (members only) ---------- */
  $('#checkoutBtn').addEventListener('click', () => {
    const user = currentUser();
    if (!user) return openAccount('auth', 'Sign in to complete your order and get 10% off.');
    if (!cart.length) { showToast('Your bag is empty — add something first.'); return; }

    const sub = cart.reduce((s, i) => s + i.qty * i.price, 0);
    const total = sub * 0.9;
    user.orders.push({
      id: 'AZ-' + Date.now().toString(36).toUpperCase(),
      date: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
      items: cart.reduce((s, i) => s + i.qty, 0),
      total: Math.round(total * 100) / 100,
      products: cart.map(i => ({ ...i }))
    });
    persist();
    cart.length = 0;
    renderCart();
    closeCart();
    showToast('Order placed! Aziz will contact you shortly ✅');
    if (accModal.classList.contains('open')) renderDashboard();
  });

  updateAccountUI();

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
})();
