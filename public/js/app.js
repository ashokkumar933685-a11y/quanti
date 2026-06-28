/* global api */

/* ═══════════════════════════════════════════════════════
   Quanti — PhonePe-style App Logic
   Rendering · Bottom Sheet · Animations · Category Modal
   ═══════════════════════════════════════════════════════ */

/* ── DOM References ─────────────────────────────────── */
const els = {
  /* Hero */
  balanceValue:   document.getElementById('balance-value'),
  statIncome:     document.getElementById('stat-income'),
  statSpend:      document.getElementById('stat-spend'),
  statPoints:     document.getElementById('stat-points'),
  greetingText:   document.getElementById('greeting-text'),

  /* Analytics */
  analyticsScroll: document.getElementById('analytics-scroll'),

  /* Transactions */
  txList:         document.getElementById('tx-list'),

  /* Composer sheet */
  sheetBackdrop:  document.getElementById('sheet-backdrop'),
  sheet:          document.getElementById('sheet'),
  form:           document.getElementById('alert-form'),
  input:          document.getElementById('alert-input'),
  error:          document.getElementById('alert-error'),

  /* Category modal */
  catBackdrop:    document.getElementById('cat-modal-backdrop'),
  catModal:       document.getElementById('cat-modal'),
  catList:        document.getElementById('cat-modal-list'),

  /* Bottom nav */
  navAdd:         document.getElementById('nav-add'),
};

let CATEGORIES = [];
let ALL_TRANSACTIONS = []; // full list for filtering
let activeFilter = null;   // currently selected quick-action filter
let activeCatTxId = null;  // which transaction is being re-categorized
let LAST_METRICS = null;

/* ── Helpers ────────────────────────────────────────── */
const inr = (n) =>
  '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });

const inrShort = (n) => {
  const abs = Math.abs(Number(n || 0));
  if (abs >= 100000) return '₹' + (abs / 100000).toFixed(1) + 'L';
  if (abs >= 1000) return '₹' + (abs / 1000).toFixed(1) + 'K';
  return inr(n);
};

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatTime(ts) {
  return new Date(ts).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

/* Category → emoji mapping */
const CAT_EMOJI = {
  FOOD:   '🍕',
  TRAVEL: '🚗',
  SALARY: '💰',
  MISC:   '✨',
};

const CAT_ICON_CLASS = {
  FOOD:   'tx-item__icon--food',
  TRAVEL: 'tx-item__icon--travel',
  SALARY: 'tx-item__icon--salary',
  MISC:   'tx-item__icon--misc',
};

const CAT_COLOR = {
  FOOD:   '#FF9100',
  TRAVEL: '#448AFF',
  SALARY: '#00C853',
  MISC:   '#AA00FF',
};

const CAT_ACTION_ICON_CLASS = {
  FOOD:   'quick-action__icon--food',
  TRAVEL: 'quick-action__icon--travel',
  SALARY: 'quick-action__icon--salary',
  MISC:   'quick-action__icon--misc',
};

/* ── Animated Counter ───────────────────────────────── */
function animateValue(el, target, prefix = '₹', duration = 800) {
  const start = 0;
  const startTime = performance.now();

  function update(now) {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / duration, 1);
    // ease-out cubic
    const eased = 1 - Math.pow(1 - progress, 3);
    const current = Math.round(start + (target - start) * eased);
    el.textContent = prefix + current.toLocaleString('en-IN');
    if (progress < 1) requestAnimationFrame(update);
  }

  requestAnimationFrame(update);
}

/* ── SVG Progress Ring ──────────────────────────────── */
function progressRingSVG(percent, color) {
  const r = 22;
  const circ = 2 * Math.PI * r;
  const offset = circ - (Math.min(percent, 100) / 100) * circ;

  return `
    <svg viewBox="0 0 52 52">
      <circle class="ring-bg" cx="26" cy="26" r="${r}" />
      <circle class="ring-fill" cx="26" cy="26" r="${r}"
        stroke="${color}"
        stroke-dasharray="${circ}"
        stroke-dashoffset="${circ}"
        data-target-offset="${offset}" />
    </svg>`;
}

/* ── Rendering ──────────────────────────────────────── */

function renderSummary(totals) {
  // Animate hero balance
  animateValue(els.balanceValue, totals.balance, '', 900);
  animateValue(els.statIncome, totals.income, '₹', 700);
  animateValue(els.statSpend, totals.spend, '₹', 700);

  // Points (no prefix)
  const pointsTarget = totals.expectedPoints || 0;
  animateValue(els.statPoints, pointsTarget, '', 600);
}

function renderAnalytics(categories) {
  if (!categories.length) {
    els.analyticsScroll.innerHTML = '<div class="empty-state"><div class="empty-state__text">No data yet</div></div>';
    return;
  }

  els.analyticsScroll.innerHTML = categories
    .map((c) => {
      const emoji = CAT_EMOJI[c.label.includes('Food') ? 'FOOD' : c.label.includes('Travel') ? 'TRAVEL' : c.label.includes('Salary') ? 'SALARY' : 'MISC'];
      const catKey = c.label.includes('Food') ? 'FOOD' : c.label.includes('Travel') ? 'TRAVEL' : c.label.includes('Salary') ? 'SALARY' : 'MISC';
      const color = CAT_COLOR[catKey] || '#AA00FF';
      return `
        <div class="analytics-card" data-percent="${c.percent}" data-color="${color}">
          <div class="analytics-card__ring" data-percent="${c.percent}">
            ${progressRingSVG(c.percent, color)}
            <div class="analytics-card__ring-icon">${emoji}</div>
          </div>
          <div class="analytics-card__bar" data-percent="${c.percent}">
            <div class="analytics-card__bar-track">
              <div class="analytics-card__bar-fill" data-target="${c.percent}" style="width:0%; background:${color};"></div>
            </div>
            <div class="analytics-card__bar-icon">${emoji}</div>
          </div>
          <div class="analytics-card__label">${escapeHtml(c.label)}</div>
          <div class="analytics-card__amount">${inr(c.amount)}</div>
          <div class="analytics-card__type">${escapeHtml(c.type)}</div>
        </div>`;
    })
    .join('');

  // Animate progress rings after render
  requestAnimationFrame(() => {
    setTimeout(() => {
      els.analyticsScroll.querySelectorAll('.ring-fill').forEach((ring) => {
        ring.style.strokeDashoffset = ring.dataset.targetOffset;
      });
    }, 100);
  });

  // Prepare bar fills (hidden by default) and bind toggle click to switch view
  els.analyticsScroll.querySelectorAll('.analytics-card').forEach((card) => {
    const percent = Number(card.dataset.percent || 0);
    const fill = card.querySelector('.analytics-card__bar-fill');
    if (fill) {
      // ensure fill has target attribute
      fill.dataset.target = String(percent);
      fill.style.width = '0%';
    }

    card.addEventListener('click', () => {
      // Toggle a class that switches from ring -> bar
      const isBar = card.classList.toggle('bar-mode');
      if (isBar) {
        // animate bar fill to target percent
        const f = card.querySelector('.analytics-card__bar-fill');
        const pct = Number(f && f.dataset.target) || 0;
        requestAnimationFrame(() => {
          f.style.width = pct + '%';
        });
      } else {
        // if switching back to ring, reset any inline width so it can re-animate later
        const f = card.querySelector('.analytics-card__bar-fill');
        if (f) f.style.width = '0%';
      }
    });
  });
}

/** Render a comparative horizontal bar chart for the supplied metrics */
function renderAnalyticsComparison(metrics) {
  if (!metrics || !metrics.categories) return;
  LAST_METRICS = metrics;

  // ensure compare container exists
  let container = document.getElementById('analytics-compare');
  if (!container) {
    container = document.createElement('div');
    container.id = 'analytics-compare';
    container.className = 'analytics-compare';
    const analyticsSection = document.querySelector('.section[aria-label="Category analytics"]');
    if (analyticsSection) analyticsSection.appendChild(container);
  }

  const cats = metrics.categories.slice();
  if (!cats.length) {
    container.innerHTML = '<div class="empty-state__text">No comparison data</div>';
    return;
  }

  const max = Math.max(1, ...cats.map((c) => Math.abs(c.amount || 0)));

  container.innerHTML = cats.map((c) => {
    const pct = Math.round((Math.abs(c.amount || 0) / max) * 100);
    const color = c.color || (c.type === 'income' ? '#00C853' : '#FF9100');
    return `
      <div class="compare-row">
        <div class="compare-label">
          <div class="compare-emoji">${CAT_EMOJI[c.id] || '📊'}</div>
          <div class="compare-name">${escapeHtml(c.label)}</div>
        </div>
        <div class="compare-bar-track">
          <div class="compare-bar-fill" data-target="${pct}" style="width:0%; background:${color};"></div>
        </div>
        <div class="compare-value">${inr(c.amount)}</div>
      </div>`;
  }).join('');

  // animate fills
  requestAnimationFrame(() => {
    setTimeout(() => {
      container.querySelectorAll('.compare-bar-fill').forEach((f) => {
        const t = Number(f.dataset.target) || 0;
        f.style.width = t + '%';
      });
    }, 80);
  });
}

function renderStream(transactions) {
  if (!transactions.length) {
    const msg = activeFilter
      ? `No ${(CATEGORIES.find(c => c.id === activeFilter) || {}).label || activeFilter} transactions yet.`
      : 'No transactions yet. Tap + to add one.';
    els.txList.innerHTML = `
      <div class="empty-state">
        <div class="empty-state__icon">${activeFilter ? CAT_EMOJI[activeFilter] || '📋' : '📋'}</div>
        <div class="empty-state__text">${msg}</div>
      </div>`;
    return;
  }

  els.txList.innerHTML = transactions
    .map((tx) => {
      const isCredit = tx.direction === 'credit';
      const sign = isCredit ? '+' : '−';
      const amtClass = isCredit ? 'tx-item__amount--credit' : 'tx-item__amount--debit';
      const amtText = (tx.amount === null || tx.amount === undefined) ? '—' : `${sign}${inr(tx.amount)}`;
      const catKey = tx.category || 'MISC';
      const emoji = CAT_EMOJI[catKey] || '✨';
      const iconClass = CAT_ICON_CLASS[catKey] || 'tx-item__icon--misc';

      const autoBadge = tx.autoTagged
        ? `<span class="tx-item__badge">Auto</span>`
        : '';

      const fraudBadge = tx.suspicious
        ? `<span class="tx-item__badge tx-item__badge--fraud" title="${escapeHtml((tx.suspicionReasons || []).join(' · '))}">⚠ Suspicious</span>`
        : '';

      const fraudHtml = tx.suspicious
        ? `<div class="tx-item__fraud">
             <span class="tx-item__fraud-icon">🚨</span>
             <span class="tx-item__fraud-text">Possible fraud: ${escapeHtml((tx.suspicionReasons || []).join(', '))}</span>
           </div>`
        : '';

      const savingsHtml = tx.expectedSavings
        ? `<div class="tx-item__savings">
             <span class="tx-item__savings-icon">🎁</span>
             <span class="tx-item__savings-text">${escapeHtml(tx.expectedSavings.message)}</span>
           </div>`
        : '';

      const catLabel = CATEGORIES.find(c => c.id === catKey);
      const catName = catLabel ? catLabel.label : catKey;

      return `
        <div class="tx-item" data-id="${tx.id}">
          <div class="tx-item__icon ${iconClass}">${emoji}</div>
          <div class="tx-item__body">
            <div class="tx-item__desc">${escapeHtml(tx.description)}</div>
            <div class="tx-item__meta">
              <span>${formatTime(tx.timestamp)}</span>
              ${autoBadge}
            </div>
          </div>
          <div class="tx-item__right">
            <div class="tx-item__amount ${amtClass}">${amtText}</div>
            <button class="tx-item__category-btn" data-id="${tx.id}" data-current="${catKey}">${escapeHtml(catName)}</button>
          </div>
          ${savingsHtml}
        </div>`;
    })
    .join('');

  // Bind category change buttons
  els.txList.querySelectorAll('.tx-item__category-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openCategoryModal(Number(btn.dataset.id), btn.dataset.current);
    });
  });
}

/* ── Category Filter (Quick Actions) ────────────────── */

function applyFilter(catKey) {
  // Toggle: click same category again to clear
  if (activeFilter === catKey) {
    activeFilter = null;
  } else {
    activeFilter = catKey;
  }

  // Update quick-action button active states
  document.querySelectorAll('.quick-action').forEach((btn) => {
    btn.classList.toggle('quick-action--active', btn.dataset.cat === activeFilter);
  });

  // Update section title
  const txTitle = document.querySelector('.section[aria-label="Transaction stream"] .section__title');
  if (txTitle) {
    if (activeFilter) {
      const cat = CATEGORIES.find(c => c.id === activeFilter);
      txTitle.textContent = cat ? cat.label : 'Filtered';
    } else {
      txTitle.textContent = 'Recent Transactions';
    }
  }

  // Filter and re-render stream
  const filtered = activeFilter
    ? ALL_TRANSACTIONS.filter(tx => tx.category === activeFilter)
    : ALL_TRANSACTIONS;
  renderStream(filtered);

  // Smooth scroll to transaction section
  const txSection = document.querySelector('.section[aria-label="Transaction stream"]');
  if (txSection) {
    txSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function renderDashboard({ transactions, metrics }) {
  ALL_TRANSACTIONS = transactions; // cache for filtering
  renderSummary(metrics.totals);
  LAST_METRICS = metrics;
  renderAnalytics(metrics.categories);

  // Apply active filter if one exists, else show all
  const filtered = activeFilter
    ? ALL_TRANSACTIONS.filter(tx => tx.category === activeFilter)
    : ALL_TRANSACTIONS;
  renderStream(filtered);
}

/* ── Bottom Sheet (Composer) ────────────────────────── */

function openSheet() {
  els.sheet.classList.add('active');
  els.sheetBackdrop.classList.add('active');
  els.navAdd.classList.add('active');
  setTimeout(() => els.input.focus(), 350);
}

function closeSheet() {
  els.sheet.classList.remove('active');
  els.sheetBackdrop.classList.remove('active');
  els.navAdd.classList.remove('active');
  els.input.blur();
}

function toggleSheet() {
  if (els.sheet.classList.contains('active')) {
    closeSheet();
  } else {
    openSheet();
  }
}

/* ── Category Modal ─────────────────────────────────── */

function openCategoryModal(txId, currentCat) {
  activeCatTxId = txId;

  els.catList.innerHTML = CATEGORIES.map((c) => {
    const catKey = c.id;
    const emoji = CAT_EMOJI[catKey] || '✨';
    const iconClass = CAT_ACTION_ICON_CLASS[catKey] || 'quick-action__icon--misc';
    const selected = catKey === currentCat ? 'selected' : '';

    return `
      <button class="cat-modal__option ${selected}" data-cat="${catKey}">
        <div class="cat-modal__option-icon ${iconClass}">${emoji}</div>
        <span>${escapeHtml(c.label)}</span>
      </button>`;
  }).join('');

  els.catModal.classList.add('active');
  els.catBackdrop.classList.add('active');

  // Bind option clicks
  els.catList.querySelectorAll('.cat-modal__option').forEach((opt) => {
    opt.addEventListener('click', async () => {
      const category = opt.dataset.cat;
      closeCategoryModal();
      try {
        const { metrics } = await api.setCategory(activeCatTxId, category);
        renderSummary(metrics.totals);
        renderAnalytics(metrics.categories);
        // Refresh stream
        const data = await api.getDashboard();
        renderStream(data.transactions);
      } catch (err) {
        els.error.textContent = err.message;
      }
    });
  });
}

function closeCategoryModal() {
  els.catModal.classList.remove('active');
  els.catBackdrop.classList.remove('active');
  activeCatTxId = null;
}

/* ── Events ─────────────────────────────────────────── */

async function onSubmit(e) {
  e.preventDefault();
  els.error.textContent = '';
  const rawMessage = els.input.value.trim();
  if (!rawMessage) return;

  try {
    await api.addAlert(rawMessage);
    els.input.value = '';
    closeSheet();
    const data = await api.getDashboard();
    renderDashboard(data);
  } catch (err) {
    els.error.textContent = err.message;
  }
}

function bindEvents() {
  // Form
  els.form.addEventListener('submit', onSubmit);

  // FAB
  els.navAdd.addEventListener('click', toggleSheet);

  // Backdrop close
  els.sheetBackdrop.addEventListener('click', closeSheet);
  els.catBackdrop.addEventListener('click', closeCategoryModal);

  // Sample chips
  document.querySelectorAll('.chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      els.input.value = chip.dataset.sample;
      els.input.focus();
    });
  });

  // Quick action category filter buttons
  document.querySelectorAll('.quick-action').forEach((btn) => {
    btn.addEventListener('click', () => {
      const cat = btn.dataset.cat;
      if (cat) applyFilter(cat);
    });
  });

  // Analytics Details button -> show comparison bars
  const btnDetails = document.getElementById('btn-see-all-analytics');
  if (btnDetails) {
    btnDetails.addEventListener('click', async () => {
      try {
        const data = await api.getDashboard();
        const metrics = data && data.metrics;
        if (!metrics) return;

        // create compare container if missing
        let container = document.getElementById('analytics-compare');
        if (!container) {
          container = document.createElement('div');
          container.id = 'analytics-compare';
          container.className = 'analytics-compare';
          const analyticsSection = document.querySelector('.section[aria-label="Category analytics"]');
          if (analyticsSection) analyticsSection.appendChild(container);
        }

        // Toggle active state
        if (container.classList.contains('active')) {
          container.classList.remove('active');
          btnDetails.textContent = 'Details →';
          return;
        }

        // Build rows
        const cats = metrics.categories || [];
        const max = Math.max(1, ...cats.map((c) => Math.abs(c.amount || 0)));
        container.innerHTML = cats.map((c) => {
          const pct = Math.round((Math.abs(c.amount || 0) / max) * 100);
          const color = c.color || (c.type === 'income' ? '#00C853' : '#FF9100');
          return `
            <div class="compare-row">
              <div class="compare-label">
                <div class="compare-emoji">${CAT_EMOJI[c.id] || '📊'}</div>
                <div class="compare-name">${escapeHtml(c.label)}</div>
              </div>
              <div class="compare-bar-track">
                <div class="compare-bar-fill" data-target="${pct}" style="width:0%; background:${color};"></div>
              </div>
              <div class="compare-value">${inr(c.amount)}</div>
            </div>`;
        }).join('');

        // animate and show
        container.classList.add('active');
        btnDetails.textContent = 'Close';
        requestAnimationFrame(() => setTimeout(() => {
          container.querySelectorAll('.compare-bar-fill').forEach((f) => {
            const t = Number(f.dataset.target) || 0;
            f.style.width = t + '%';
          });
        }, 80));
        container.scrollIntoView({ behavior: 'smooth' });
      } catch (err) {
        console.error('Failed to load dashboard for comparison', err);
      }
    });
  }

  // Bottom nav tabs (cosmetic active state)
  document.querySelectorAll('.nav-item').forEach((item) => {
    item.addEventListener('click', () => {
      document.querySelectorAll('.nav-item').forEach((i) => i.classList.remove('active'));
      item.classList.add('active');
      const tab = item.dataset.tab;
      showTab(tab);
    });
  });

  // Keyboard shortcut: Escape to close sheets
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (els.catModal.classList.contains('active')) {
        closeCategoryModal();
      } else if (els.sheet.classList.contains('active')) {
        closeSheet();
      }
    }
  });
}

function showTab(tab) {
  const hero = document.querySelector('.hero');
  const quick = document.querySelector('.quick-actions');
  const analyticsSection = document.querySelector('.section[aria-label="Category analytics"]');
  const txSection = document.querySelector('.section[aria-label="Transaction stream"]');

  // default: hide all then selectively show
  if (hero) hero.classList.toggle('hidden', tab !== 'home');
  if (quick) quick.classList.toggle('hidden', tab === 'analytics' || tab === 'history');

  if (analyticsSection) analyticsSection.classList.toggle('hidden', tab === 'history');
  if (txSection) txSection.classList.toggle('hidden', tab === 'analytics');

  // When switching to analytics, ensure it's visible/focused
  if (tab === 'analytics' && analyticsSection) {
    analyticsSection.scrollIntoView({ behavior: 'smooth' });
  }
}

/* ── Boot ───────────────────────────────────────────── */

async function init() {
  // Set greeting based on time of day
  els.greetingText.textContent = getGreeting();

  bindEvents();

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

  // Ensure default tab is visible
  showTab('home');
}

init();
