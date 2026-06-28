/* global api */

const els = {
  analytics: document.getElementById('analytics-grid'),
  stream: document.getElementById('stream-list'),
  form: document.getElementById('alert-form'),
  input: document.getElementById('alert-input'),
  error: document.getElementById('alert-error'),
  income: document.getElementById('summary-income'),
  spend: document.getElementById('summary-spend'),
  balance: document.getElementById('summary-balance'),
  points: document.getElementById('summary-points'),
};

let CATEGORIES = [];

const inr = (n) =>
  '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });

/* ---------- Rendering ---------- */

function renderSummary(totals) {
  els.income.textContent = inr(totals.income);
  els.spend.textContent = inr(totals.spend);
  els.balance.textContent = inr(totals.balance);
  els.points.textContent = totals.expectedPoints;
}

function renderAnalytics(categories) {
  els.analytics.innerHTML = categories
    .map(
      (c) => `
      <div class="cat-card">
        <div class="cat-card__head">
          <span class="cat-card__label">${c.label}</span>
          <span class="cat-card__type">${c.type}</span>
        </div>
        <div class="cat-card__amount">${inr(c.amount)}</div>
        <div class="track">
          <div class="track__fill" style="width:${c.percent}%;background:${c.color}"></div>
        </div>
      </div>`
    )
    .join('');
}

function categoryOptions(selected) {
  return CATEGORIES.map(
    (c) =>
      `<option value="${c.id}" ${c.id === selected ? 'selected' : ''}>${c.label}</option>`
  ).join('');
}

function savingsRow(tx) {
  if (!tx.expectedSavings) return '';
  return `
    <div class="savings">
      <span class="savings__icon">🎁</span>
      <span class="savings__text">${escapeHtml(tx.expectedSavings.message)}</span>
    </div>`;
}

function renderStream(transactions) {
  if (!transactions.length) {
    els.stream.innerHTML = '<div class="empty">No transactions yet. Add an alert above.</div>';
    return;
  }

  els.stream.innerHTML = transactions
    .map((tx) => {
      const isCredit = tx.direction === 'credit';
      const sign = isCredit ? '+' : '−';
      const amountClass = isCredit ? 'tx-card__amount--in' : 'tx-card__amount--out';
      const autoBadge = tx.autoTagged
        ? `<span class="badge badge--auto">Auto: ${escapeHtml(tx.merchant || 'tagged')}</span>`
        : '';

      return `
        <article class="tx-card" data-id="${tx.id}">
          <div class="tx-card__top">
            <div>
              <p class="tx-card__desc">${escapeHtml(tx.description)}</p>
              <div class="tx-card__meta">
                <span>${formatTime(tx.timestamp)}</span>
                ${autoBadge}
              </div>
            </div>
            <span class="tx-card__amount ${amountClass}">${sign}${inr(tx.amount)}</span>
          </div>
          <div class="tx-card__controls">
            <label for="cat-${tx.id}">Category</label>
            <select class="select" id="cat-${tx.id}" data-id="${tx.id}">
              ${categoryOptions(tx.category)}
            </select>
          </div>
          ${savingsRow(tx)}
        </article>`;
    })
    .join('');

  // Wire up the category dropdowns.
  els.stream.querySelectorAll('.select').forEach((sel) => {
    sel.addEventListener('change', onCategoryChange);
  });
}

function renderDashboard({ transactions, metrics }) {
  renderSummary(metrics.totals);
  renderAnalytics(metrics.categories);
  renderStream(transactions);
}

/* ---------- Events ---------- */

async function onCategoryChange(e) {
  const id = Number(e.target.dataset.id);
  const category = e.target.value;
  try {
    const { metrics } = await api.setCategory(id, category);
    renderSummary(metrics.totals);
    renderAnalytics(metrics.categories);
    // Re-fetch the feed so the "auto" badge clears after a manual override.
    const data = await api.getDashboard();
    renderStream(data.transactions);
  } catch (err) {
    els.error.textContent = err.message;
  }
}

async function onSubmit(e) {
  e.preventDefault();
  els.error.textContent = '';
  const rawMessage = els.input.value.trim();
  if (!rawMessage) return;

  try {
    await api.addAlert(rawMessage);
    els.input.value = '';
    const data = await api.getDashboard();
    renderDashboard(data);
  } catch (err) {
    els.error.textContent = err.message;
  }
}

function bindSampleChips() {
  document.querySelectorAll('.chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      els.input.value = chip.dataset.sample;
      els.input.focus();
    });
  });
}

/* ---------- Helpers ---------- */

function formatTime(ts) {
  return new Date(ts).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ---------- Boot ---------- */

async function init() {
  els.form.addEventListener('submit', onSubmit);
  bindSampleChips();
  try {
    const [{ categories }, dashboard] = await Promise.all([
      api.getCategories(),
      api.getDashboard(),
    ]);
    CATEGORIES = categories;
    renderDashboard(dashboard);
  } catch (err) {
    els.error.textContent = err.message;
  }
}

init();
