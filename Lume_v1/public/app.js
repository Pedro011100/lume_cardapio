(() => {
  const { categories, products } = window.CASA_AURORA_DATA;
  const money = (value) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  const loadCart = () => {
    try {
      const saved = JSON.parse(localStorage.getItem('lume-cart') || '[]');
      if (!Array.isArray(saved)) return [];

      return saved
        .filter((item) => item && typeof item.productId === 'string')
        .map((item) => ({ productId: item.productId, quantity: Number(item.quantity) }))
        .filter((item) => products.some((product) => product.id === item.productId) && Number.isInteger(item.quantity) && item.quantity > 0)
        .map((item) => ({ ...item, quantity: Math.min(item.quantity, 99) }));
    } catch {
      localStorage.removeItem('lume-cart');
      return [];
    }
  };
  const state = { category: 'todas', search: '', page: 1, pageSize: 8, cart: loadCart(), service: true };
  const $ = (selector) => document.querySelector(selector);
  const save = () => { localStorage.setItem('lume-cart', JSON.stringify(state.cart)); renderCart(); };
  const toast = (message) => { const node = $('#toast'); node.textContent = message; node.classList.add('show'); setTimeout(() => node.classList.remove('show'), 2200); };
  const getCategory = (id) => categories.find((category) => category.id === id);
  const filteredProducts = () => products.filter((product) => {
    const categoryMatch = state.category === 'todas' || product.category === state.category;
    const query = state.search.trim().toLocaleLowerCase('pt-BR');
    return categoryMatch && (!query || `${product.name} ${product.description}`.toLocaleLowerCase('pt-BR').includes(query));
  });
  function renderCategories() {
    $('#categories').innerHTML = [`<button class="${state.category === 'todas' ? 'active' : ''}" data-category="todas">Todos</button>`, ...categories.map((category) => `<button class="${state.category === category.id ? 'active' : ''}" data-category="${category.id}">${category.label}</button>`)].join('');
    $('#categories').querySelectorAll('button').forEach((button) => button.addEventListener('click', () => { state.category = button.dataset.category; state.page = 1; render(); }));
  }
  function renderProducts() {
    const list = filteredProducts();
    const pages = Math.max(1, Math.ceil(list.length / state.pageSize));
    state.page = Math.min(state.page, pages);
    const visible = list.slice((state.page - 1) * state.pageSize, state.page * state.pageSize);
    $('#result-count').textContent = `${list.length} itens`;
    $('#product-grid').innerHTML = visible.map((product) => `<article class="product"><span class="category">${getCategory(product.category)?.label || product.category}</span><h3>${product.name}</h3><p>${product.description}</p><footer><strong>${money(product.price)}</strong><button data-add="${product.id}">Adicionar ao pedido</button></footer></article>`).join('');
    $('#product-grid').querySelectorAll('[data-add]').forEach((button) => button.addEventListener('click', () => add(button.dataset.add)));
    $('#pagination').innerHTML = pages > 1 ? `<button ${state.page === 1 ? 'disabled' : ''} data-page="${state.page - 1}">←</button><span>Página ${state.page} de ${pages}</span><button ${state.page === pages ? 'disabled' : ''} data-page="${state.page + 1}">→</button>` : '';
    $('#pagination').querySelectorAll('[data-page]').forEach((button) => button.addEventListener('click', () => { state.page = Number(button.dataset.page); renderProducts(); }));
  }
  function add(id) {
    const existing = state.cart.find((item) => item.productId === id);
    if (existing) {
      if (existing.quantity >= 99) return toast('A quantidade máxima por produto é 99.');
      existing.quantity += 1;
    } else {
      state.cart.push({ productId: id, quantity: 1 });
    }
    save();
    toast('Item adicionado ao pedido.');
  }
  function change(id, amount) {
    const item = state.cart.find((entry) => entry.productId === id);
    if (!item) return;

    item.quantity = Math.min(99, item.quantity + amount);
    state.cart = state.cart.filter((entry) => entry.quantity > 0);
    save();
  }
  function cartDetails() { return state.cart.map((item) => ({ ...item, product: products.find((product) => product.id === item.productId) })).filter((item) => item.product); }
  function totals() { const subtotal = cartDetails().reduce((sum, item) => sum + item.product.price * item.quantity, 0); const service = state.service ? subtotal * 0.1 : 0; return { subtotal, service, total: subtotal + service }; }
  function renderCart() {
    const details = cartDetails(); const { subtotal, service, total } = totals();
    $('#cart-count').textContent = state.cart.reduce((sum, item) => sum + item.quantity, 0);
    $('#cart-items').innerHTML = details.length ? details.map(({ product, quantity }) => `<div class="cart-row"><div><strong>${product.name}</strong><small>${quantity} × ${money(product.price)} cada</small><small class="item-total">Total do item: ${money(product.price * quantity)}</small></div><div class="qty"><button aria-label="Diminuir ${product.name}" data-change="${product.id}" data-amount="-1">−</button><b>${quantity}</b><button aria-label="Aumentar ${product.name}" data-change="${product.id}" data-amount="1">+</button><button class="remove" aria-label="Remover ${product.name}" data-remove="${product.id}">×</button></div></div>`).join('') : '<p class="empty">Seu pedido está vazio.<br>Escolha algo no cardápio.</p>';
    $('#cart-items').querySelectorAll('[data-change]').forEach((button) => button.addEventListener('click', () => change(button.dataset.change, Number(button.dataset.amount))));
    $('#cart-items').querySelectorAll('[data-remove]').forEach((button) => button.addEventListener('click', () => { state.cart = state.cart.filter((item) => item.productId !== button.dataset.remove); save(); }));
    $('#subtotal').textContent = money(subtotal); $('#service').textContent = state.service ? money(service) : '—'; $('#total').textContent = money(total);
  }
  function render() { renderCategories(); renderProducts(); renderCart(); }
  function openCheckout() {
    if (!state.cart.length) return toast('Adicione ao menos um item ao pedido.');
    const modal = document.createElement('div'); modal.className = 'checkout-backdrop'; modal.innerHTML = `<form class="checkout-modal" id="checkout-form"><button type="button" class="close" id="close-checkout">×</button><span class="eyebrow">Finalização</span><h2>Direto para<br><em>a sua mesa.</em></h2><p>Informe seus dados e escolha a forma de pagamento.</p><label>Seu nome<input name="name" required minlength="2" placeholder="Ex.: Marina"></label><label>Número da mesa <small>(1 a 50)</small><input name="table" type="number" min="1" max="50" step="1" required placeholder="Ex.: 12"></label><fieldset><legend>Forma de pagamento</legend><label><input type="radio" name="payment" value="card" checked> Cartão</label><label><input type="radio" name="payment" value="pix"> PIX</label><label><input type="radio" name="payment" value="cash"> Dinheiro</label></fieldset><button class="button full" type="submit">Finalizar pedido →</button><p class="api-status" id="api-status"></p></form>`; document.body.append(modal);
    $('#close-checkout').addEventListener('click', () => modal.remove());
    $('#checkout-form').addEventListener('submit', async (event) => { event.preventDefault(); const form = new FormData(event.currentTarget); const table = Number(form.get('table')); if (!Number.isInteger(table) || table < 1 || table > 50) return toast('Informe uma mesa entre 1 e 50.'); const button = event.currentTarget.querySelector('button[type="submit"]'); button.disabled = true; button.textContent = 'Enviando...'; try { const response = await fetch('/api/orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ customerName: form.get('name'), tableNumber: table, paymentMethod: form.get('payment'), serviceFeeEnabled: state.service, items: state.cart }) }); const payload = await response.json(); if (!response.ok) throw new Error(payload.error || 'Não foi possível registrar o pedido.'); state.cart = []; save(); modal.remove(); showConfirmation(payload.order); } catch (error) { button.disabled = false; button.textContent = 'Finalizar pedido →'; $('#api-status').textContent = error.message; } });
  }
  function showConfirmation(order) { const section = $('#confirmation'); section.classList.remove('hidden'); section.replaceChildren(); const eyebrow = document.createElement('span'); eyebrow.className = 'eyebrow'; eyebrow.textContent = 'Pedido confirmado'; const reference = document.createElement('h2'); reference.textContent = order.reference; const message = document.createElement('p'); message.textContent = `${order.customerName}, seu pedido foi enviado para a mesa ${order.tableNumber}.`; const summary = document.createElement('div'); summary.className = 'confirmation-summary'; const summaryTitle = document.createElement('h3'); summaryTitle.textContent = 'Resumo do pedido'; const items = document.createElement('ul'); items.className = 'confirmation-items'; for (const item of order.items) { const row = document.createElement('li'); const description = document.createElement('span'); description.textContent = `${item.quantity} × ${item.name} (${money(item.unitPrice)} cada)`; const itemTotal = document.createElement('strong'); itemTotal.textContent = money(item.itemTotal); row.append(description, itemTotal); items.append(row); } const totalsBox = document.createElement('div'); totalsBox.className = 'confirmation-totals'; const addTotal = (label, value, emphasis = false) => { const row = document.createElement(emphasis ? 'strong' : 'span'); row.textContent = label; const amount = document.createElement('b'); amount.textContent = money(value); row.append(amount); totalsBox.append(row); }; addTotal('Subtotal', order.subtotal); addTotal(order.serviceFee > 0 ? 'Garçom (10%)' : 'Garçom (10%) — não cobrado', order.serviceFee); addTotal('Total', order.total, true); summary.append(summaryTitle, items, totalsBox); section.append(eyebrow, reference, message, summary); section.scrollIntoView({ behavior: 'smooth' }); }
  $('#search').addEventListener('input', (event) => { state.search = event.target.value; state.page = 1; renderProducts(); }); $('#service-fee').addEventListener('change', (event) => { state.service = event.target.checked; renderCart(); }); $('#checkout-button').addEventListener('click', openCheckout); render();
})();
