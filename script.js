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
     SUPABASE AUTH — real accounts that work on every device
     Per-user data (saved items, orders) lives in auth metadata.
     ============================================================ */
  const SB_URL = 'https://oclxrheghqarandewokw.supabase.co';
  const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9jbHhyaGVnaHFhcmFuZGV3b2t3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTU3MzE5MTAsImV4cCI6MjExMTMwNzkxMH0.bIh_eg0YZcfYvk_ehuJ6IMB527uJKS8tHRfkd1myOEs';
  const SESSION_KEY = 'az_sb_session_v1';
  const money = n => '$' + n.toFixed(2);

  async function sb(path, { method = 'GET', body, token } = {}) {
    const headers = {
      apikey: SB_KEY,
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
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
    if (!currentUser()) $('#authIntro').textContent = 'Sign in to track orders, save products and unlock member pricing.';
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
    $$('.save-btn').forEach(btn => {
      const saved = !!user && user.saved.includes(btn.dataset.id);
      btn.classList.toggle('saved', saved);
      btn.textContent = saved ? '♥' : '♡';
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
  $('#checkoutBtn').addEventListener('click', async () => {
    const user = currentUser();
    if (!user) return openAccount('auth', 'Sign in to complete your order and get 10% off.');
    if (!cart.length) { showToast('Your bag is empty — add something first.'); return; }

    const sub = cart.reduce((s, i) => s + i.qty * i.price, 0);
    const total = Math.round(sub * 0.9 * 100) / 100;
    const order = {
      id: 'AZ-' + Date.now().toString(36).toUpperCase(),
      date: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
      items: cart.reduce((s, i) => s + i.qty, 0),
      total,
      products: cart.map(i => ({ ...i }))
    };
    const ok = await updateProfile({ orders: [...user.orders, order] });
    if (!ok) return showToast('Could not save your order. Please try again.');
    cart.length = 0;
    renderCart();
    closeCart();
    showToast('Order placed! Aziz will contact you shortly ✅');
    if (accModal.classList.contains('open')) renderDashboard();
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
})();
