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

  // nav / category / footer quick links
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
    toastTimer = setTimeout(() => toast.classList.remove('show'), 2600);
  }

  /* ---------- account modal ---------- */
  const accModal = $('#accountModal');
  const openAccount = () => {
    accModal.classList.add('open');
    document.body.style.overflow = 'hidden';
    setTimeout(() => $('#accEmail').focus(), 280);
  };
  const closeAccount = () => {
    accModal.classList.remove('open');
    document.body.style.overflow = '';
  };
  $('#accountBtn').addEventListener('click', openAccount);
  $('#accountClose').addEventListener('click', closeAccount);
  accModal.addEventListener('click', e => { if (e.target === accModal) closeAccount(); });

  let accMode = 'signin';
  $('#accSwitch').addEventListener('click', () => {
    accMode = accMode === 'signin' ? 'signup' : 'signin';
    $('.account-box h3').textContent = accMode === 'signup' ? 'JOIN THE CLUB.' : 'WELCOME BACK.';
    $('.account-box > p').textContent = accMode === 'signup'
      ? 'Create your account to track orders and unlock member-only deals.'
      : 'Sign in to track your orders, save your favourites and get member-only deals.';
    $('#accSwitch').textContent = accMode === 'signup' ? 'Sign in instead' : 'Create an account';
    $('.account-box .btn').innerHTML = (accMode === 'signup' ? 'CREATE ACCOUNT' : 'SIGN IN') + ' <span class="arr">↗</span>';
  });

  $('#accountForm').addEventListener('submit', e => {
    e.preventDefault();
    const email = $('#accEmail').value.trim();
    closeAccount();
    e.target.reset();
    showToast(accMode === 'signup' ? `Welcome, ${email}! Account created 🎉` : `Welcome back, ${email}! ✅`);
  });

  /* ---------- cart ---------- */
  const cart = [];            // {id, name, price, img, qty}
  const drawer = $('#cartDrawer');
  const overlay = $('#overlay');
  const itemsEl = $('#cartItems');
  const emptyEl = $('#cartEmpty');

  const money = n => '$' + n.toFixed(2);

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
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { closeCart(); closeNav(); }
  });

  function renderCart() {
    const count = cart.reduce((s, i) => s + i.qty, 0);
    const total = cart.reduce((s, i) => s + i.qty * i.price, 0);
    $('#cartCount').textContent = count;
    $('#cartHeadCount').textContent = `(${count})`;
    $('#cartTotal').textContent = money(total);

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

  $$('.quick-add').forEach(btn => {
    btn.addEventListener('click', () => {
      const { id, name, price, img } = btn.dataset;
      const found = cart.find(i => i.id === id);
      if (found) found.qty++;
      else cart.push({ id, name, price: parseFloat(price), img, qty: 1 });
      renderCart();
      showToast(`Added — ${name} 💪`);
      btn.classList.add('added');
      btn.textContent = 'ADDED ✓';
      setTimeout(() => {
        btn.classList.remove('added');
        btn.textContent = 'ADD TO BAG +';
      }, 1400);
    });
  });

  $('#checkoutBtn').addEventListener('click', () => {
    if (!cart.length) { showToast('Your bag is empty — add something first.'); return; }
    showToast('Order received! Aziz will contact you shortly ✅');
    cart.length = 0;
    renderCart();
    setTimeout(closeCart, 900);
  });

  renderCart();

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
