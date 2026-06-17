import { showToast } from './ui.js';

// ── localStorage helpers ──
function fGet(key) { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } }
function fSet(key, val) { localStorage.setItem(key, JSON.stringify(val)); }

const KEYS = {
  budget: 'finance_budget_settings',
  transactions: 'finance_transactions',
  goals: 'finance_goals',
  bills: 'finance_bills',
};

function genId() { return Math.random().toString(36).slice(2, 9); }

function getToday() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}

function getMonthKey() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0');
}

function fmtCurrency(n) {
  const abs = Math.abs(n);
  const formatted = abs >= 1000 ? (abs/1000).toFixed(1) + 'k' : abs.toFixed(2);
  return (n < 0 ? '-' : '') + '€' + formatted;
}

function fmtCurrencyFull(n) {
  return (n < 0 ? '-' : '') + '€' + Math.abs(n).toFixed(2);
}

// ── Data accessors ──
function getBudget() {
  return fGet(KEYS.budget) || { income: 0, needs: 0, wants: 0, debtSavings: 0, fixedBills: 0, plannedSavings: 0, debtPayments: 0 };
}

function getTransactions() { return fGet(KEYS.transactions) || []; }
function getGoals() { return fGet(KEYS.goals) || []; }
function getBills() { return fGet(KEYS.bills) || []; }

function getCurrentMonthTransactions() {
  const month = getMonthKey();
  return getTransactions().filter(t => t.date && t.date.startsWith(month));
}

function computeSummary() {
  const budget = getBudget();
  const txns = getCurrentMonthTransactions();
  const bills = getBills();

  const income = budget.income || 0;
  const fixedBills = budget.fixedBills || 0;
  const plannedSavings = budget.plannedSavings || 0;
  const debtPayments = budget.debtPayments || 0;

  let spentNeeds = 0, spentWants = 0, spentDebtSavings = 0, totalIncome = income;
  txns.forEach(t => {
    if (t.type === 'income') { totalIncome += t.amount; return; }
    if (t.bucket === 'needs') spentNeeds += t.amount;
    else if (t.bucket === 'wants') spentWants += t.amount;
    else if (t.bucket === 'debtSavings') spentDebtSavings += t.amount;
  });

  const unpaidBills = bills.filter(b => !b.paid).reduce((a, b) => a + (b.amount || 0), 0);
  const spentOther = spentNeeds; // needs is captured separately

  const safeToSpend = income - fixedBills - plannedSavings - debtPayments - spentWants - spentNeeds;
  const spentThisMonth = spentNeeds + spentWants + spentDebtSavings;

  return {
    income,
    safeToSpend,
    spentThisMonth,
    unpaidBills,
    spentNeeds,
    spentWants,
    spentDebtSavings,
    budgetNeeds: budget.needs || 0,
    budgetWants: budget.wants || 0,
    budgetDebtSavings: budget.debtSavings || 0,
  };
}

// ── Progress bar helper ──
function progressBar(spent, budget) {
  const pct = budget > 0 ? Math.min(100, Math.round((spent / budget) * 100)) : 0;
  let color = 'var(--success)';
  let status = 'On track';
  if (pct >= 100) { color = 'var(--danger)'; status = 'Over budget'; }
  else if (pct >= 80) { color = 'var(--warning)'; status = 'Close to limit'; }

  const wrap = document.createElement('div');
  wrap.className = 'fn-progress-wrap';

  const bar = document.createElement('div');
  bar.className = 'fn-progress-bar';
  const fill = document.createElement('div');
  fill.className = 'fn-progress-fill';
  fill.style.width = pct + '%';
  fill.style.background = color;
  bar.appendChild(fill);

  const meta = document.createElement('div');
  meta.className = 'fn-progress-meta';
  meta.innerHTML =
    '<span class="fn-progress-status" style="color:' + color + '">' + status + '</span>' +
    '<span class="fn-progress-pct">' + pct + '%</span>';

  wrap.appendChild(bar);
  wrap.appendChild(meta);
  return wrap;
}

// ── Insight generator ──
function generateInsight(summary) {
  const { income, safeToSpend, spentWants, budgetWants, spentNeeds, budgetNeeds } = summary;
  if (!income) return 'Add your income and first transactions to get insights.';
  if (safeToSpend < 0) return '⚠️ You are over budget. Review your wants and subscriptions.';
  const wantsPct = budgetWants > 0 ? spentWants / budgetWants : 0;
  const needsPct = budgetNeeds > 0 ? spentNeeds / budgetNeeds : 0;
  if (wantsPct >= 0.8) return '👀 Your wants spending is getting high. Slow down for the rest of the month.';
  if (needsPct >= 0.9) return '💸 Needs are almost maxed. Watch your essentials spending.';
  if (safeToSpend > income * 0.3) return '✅ Good job — you\'re well within budget. Stay the course.';
  return '📊 Tracking well. Keep logging transactions to stay on top of your finances.';
}

// ── Main render ──
export function renderFinance() {
  const container = document.getElementById('viewFinanceContent');
  container.innerHTML = '';

  const summary = computeSummary();
  const budget = getBudget();
  const hasBudget = budget.income > 0;

  // ─ Safe to Spend hero ─
  const hero = document.createElement('div');
  hero.className = 'card fn-hero-card';
  const heroColor = summary.safeToSpend < 0 ? 'var(--danger)' : summary.safeToSpend < summary.income * 0.1 ? 'var(--warning)' : 'var(--success)';
  hero.innerHTML =
    '<div class="fn-hero-label">Safe to Spend</div>' +
    '<div class="fn-hero-amount" style="color:' + heroColor + '">' + fmtCurrencyFull(summary.safeToSpend) + '</div>' +
    '<div class="fn-hero-sub">' + (hasBudget ? 'This month · ' + getMonthKey() : 'Set your budget below') + '</div>';
  container.appendChild(hero);

  // ─ Summary cards row ─
  const summaryRow = document.createElement('div');
  summaryRow.className = 'fn-summary-row';
  const summaryCards = [
    { label: 'Monthly Income', value: fmtCurrency(summary.income), color: 'var(--success)' },
    { label: 'Spent', value: fmtCurrency(summary.spentThisMonth), color: 'var(--text-primary)' },
    { label: 'Bills Left', value: fmtCurrency(summary.unpaidBills), color: summary.unpaidBills > 0 ? 'var(--warning)' : 'var(--text-secondary)' },
  ];
  summaryCards.forEach(({ label, value, color }) => {
    const card = document.createElement('div');
    card.className = 'fn-sum-card';
    card.innerHTML =
      '<div class="fn-sum-value" style="color:' + color + '">' + value + '</div>' +
      '<div class="fn-sum-label">' + label + '</div>';
    summaryRow.appendChild(card);
  });
  container.appendChild(summaryRow);

  // ─ Insight box ─
  const insightCard = document.createElement('div');
  insightCard.className = 'card fn-insight-card';
  insightCard.innerHTML =
    '<div class="fn-insight-label">Finance Insight</div>' +
    '<div class="fn-insight-text">' + generateInsight(summary) + '</div>';
  container.appendChild(insightCard);

  // ─ Budget buckets ─
  const bucketsLabel = document.createElement('div');
  bucketsLabel.className = 'section-label';
  bucketsLabel.textContent = 'Budget Buckets';
  container.appendChild(bucketsLabel);

  const bucketsWrap = document.createElement('div');
  bucketsWrap.className = 'fn-buckets-wrap';

  const buckets = [
    { key: 'needs', label: '🏠 Needs', spent: summary.spentNeeds, budget: summary.budgetNeeds, desc: 'Rent, groceries, utilities' },
    { key: 'wants', label: '🎉 Wants', spent: summary.spentWants, budget: summary.budgetWants, desc: 'Dining, entertainment, shopping' },
    { key: 'debtSavings', label: '💰 Debt / Savings', spent: summary.spentDebtSavings, budget: summary.budgetDebtSavings, desc: 'Payments & savings deposits' },
  ];

  buckets.forEach(({ label, spent, budget: bgt, desc }) => {
    const card = document.createElement('div');
    card.className = 'card fn-bucket-card';
    const remaining = bgt - spent;

    card.innerHTML =
      '<div class="fn-bucket-header">' +
        '<div><div class="fn-bucket-title">' + label + '</div><div class="fn-bucket-desc">' + desc + '</div></div>' +
        '<div class="fn-bucket-amounts">' +
          '<span class="fn-bucket-spent">' + fmtCurrency(spent) + '</span>' +
          '<span class="fn-bucket-sep"> / </span>' +
          '<span class="fn-bucket-budget">' + fmtCurrency(bgt) + '</span>' +
        '</div>' +
      '</div>';

    if (bgt > 0) {
      card.appendChild(progressBar(spent, bgt));
      const rem = document.createElement('div');
      rem.className = 'fn-bucket-remaining';
      rem.textContent = remaining >= 0 ? fmtCurrency(remaining) + ' remaining' : fmtCurrency(Math.abs(remaining)) + ' over budget';
      rem.style.color = remaining >= 0 ? 'var(--text-secondary)' : 'var(--danger)';
      card.appendChild(rem);
    } else {
      const noBudget = document.createElement('div');
      noBudget.className = 'fn-empty-hint';
      noBudget.textContent = 'No budget set — update settings below.';
      card.appendChild(noBudget);
    }

    bucketsWrap.appendChild(card);
  });
  container.appendChild(bucketsWrap);

  // ─ Transactions ─
  renderTransactionsSection(container);

  // ─ Bills ─
  renderBillsSection(container);

  // ─ Goals ─
  renderGoalsSection(container);

  // ─ Budget settings ─
  renderBudgetSettings(container);
}

// ── Transactions section ──
function renderTransactionsSection(container) {
  const label = document.createElement('div');
  label.className = 'section-label';
  label.textContent = 'Transactions';
  container.appendChild(label);

  const addBtn = document.createElement('button');
  addBtn.className = 'tr-primary-btn fn-add-btn';
  addBtn.textContent = '+ Add Transaction';
  addBtn.addEventListener('click', () => openTransactionModal());
  container.appendChild(addBtn);

  const txns = getTransactions();
  const monthTxns = [...getCurrentMonthTransactions()].sort((a, b) => b.date.localeCompare(a.date));

  if (monthTxns.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'fn-empty-state';
    empty.textContent = 'No transactions yet. Add your first expense or income.';
    container.appendChild(empty);
    return;
  }

  const list = document.createElement('div');
  list.className = 'fn-txn-list';

  monthTxns.forEach(txn => {
    const row = document.createElement('div');
    row.className = 'fn-txn-row';

    const bucketEmoji = { needs: '🏠', wants: '🎉', debtSavings: '💰' };
    const typeColor = txn.type === 'income' ? 'var(--success)' : 'var(--text-primary)';
    const sign = txn.type === 'income' ? '+' : '-';

    row.innerHTML =
      '<div class="fn-txn-left">' +
        '<div class="fn-txn-icon">' + (bucketEmoji[txn.bucket] || '💳') + '</div>' +
        '<div class="fn-txn-info">' +
          '<div class="fn-txn-name">' + txn.name + '</div>' +
          '<div class="fn-txn-meta">' + txn.date + (txn.category ? ' · ' + txn.category : '') + '</div>' +
        '</div>' +
      '</div>' +
      '<div class="fn-txn-right">' +
        '<div class="fn-txn-amount" style="color:' + typeColor + '">' + sign + fmtCurrencyFull(txn.amount) + '</div>' +
        '<button class="fn-icon-btn fn-delete-btn" data-id="' + txn.id + '" aria-label="Delete">✕</button>' +
      '</div>';

    list.appendChild(row);
  });

  list.addEventListener('click', e => {
    const btn = e.target.closest('.fn-delete-btn');
    if (!btn) return;
    const id = btn.dataset.id;
    const all = getTransactions().filter(t => t.id !== id);
    fSet(KEYS.transactions, all);
    renderFinance();
    showToast('Transaction deleted');
  });

  container.appendChild(list);
}

// ── Transaction modal ──
function openTransactionModal(existing) {
  const overlay = document.createElement('div');
  overlay.className = 'fn-modal-overlay';

  const modal = document.createElement('div');
  modal.className = 'fn-modal card';

  const title = document.createElement('div');
  title.className = 'fn-modal-title';
  title.textContent = existing ? 'Edit Transaction' : 'Add Transaction';

  modal.innerHTML =
    '<div class="fn-modal-title">' + (existing ? 'Edit Transaction' : 'Add Transaction') + '</div>' +
    '<div class="fn-form-group">' +
      '<label class="fn-label">Name</label>' +
      '<input class="tr-input" id="fn-txn-name" placeholder="e.g. Groceries" value="' + (existing ? existing.name : '') + '">' +
    '</div>' +
    '<div class="fn-form-row">' +
      '<div class="fn-form-group">' +
        '<label class="fn-label">Amount (€)</label>' +
        '<input class="tr-input" id="fn-txn-amount" type="number" min="0" step="0.01" placeholder="0.00" value="' + (existing ? existing.amount : '') + '">' +
      '</div>' +
      '<div class="fn-form-group">' +
        '<label class="fn-label">Date</label>' +
        '<input class="tr-input" id="fn-txn-date" type="date" value="' + (existing ? existing.date : getToday()) + '">' +
      '</div>' +
    '</div>' +
    '<div class="fn-form-group">' +
      '<label class="fn-label">Category (optional)</label>' +
      '<input class="tr-input" id="fn-txn-category" placeholder="e.g. Food, Transport" value="' + (existing ? existing.category || '' : '') + '">' +
    '</div>' +
    '<div class="fn-form-row">' +
      '<div class="fn-form-group">' +
        '<label class="fn-label">Bucket</label>' +
        '<select class="tr-input" id="fn-txn-bucket">' +
          '<option value="needs"' + (existing && existing.bucket === 'needs' ? ' selected' : '') + '>Needs</option>' +
          '<option value="wants"' + (existing && existing.bucket === 'wants' ? ' selected' : '') + '>Wants</option>' +
          '<option value="debtSavings"' + (existing && existing.bucket === 'debtSavings' ? ' selected' : '') + '>Debt / Savings</option>' +
        '</select>' +
      '</div>' +
      '<div class="fn-form-group">' +
        '<label class="fn-label">Type</label>' +
        '<select class="tr-input" id="fn-txn-type">' +
          '<option value="expense"' + (existing && existing.type === 'expense' ? ' selected' : '') + '>Expense</option>' +
          '<option value="income"' + (existing && existing.type === 'income' ? ' selected' : '') + '>Income</option>' +
        '</select>' +
      '</div>' +
    '</div>' +
    '<div class="fn-modal-actions">' +
      '<button class="tr-secondary-btn" id="fn-modal-cancel">Cancel</button>' +
      '<button class="tr-primary-btn" id="fn-modal-save">Save</button>' +
    '</div>';

  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('fn-modal-visible'));

  const close = () => {
    overlay.classList.remove('fn-modal-visible');
    setTimeout(() => overlay.remove(), 240);
  };

  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  modal.querySelector('#fn-modal-cancel').addEventListener('click', close);
  modal.querySelector('#fn-modal-save').addEventListener('click', () => {
    const name = modal.querySelector('#fn-txn-name').value.trim();
    const amount = parseFloat(modal.querySelector('#fn-txn-amount').value);
    const date = modal.querySelector('#fn-txn-date').value;
    const category = modal.querySelector('#fn-txn-category').value.trim();
    const bucket = modal.querySelector('#fn-txn-bucket').value;
    const type = modal.querySelector('#fn-txn-type').value;

    if (!name) { showToast('Name is required', 'error'); return; }
    if (!amount || isNaN(amount) || amount <= 0) { showToast('Enter a valid amount', 'error'); return; }
    if (!date) { showToast('Date is required', 'error'); return; }

    const all = getTransactions();
    if (existing) {
      const idx = all.findIndex(t => t.id === existing.id);
      if (idx >= 0) all[idx] = { ...existing, name, amount, date, category, bucket, type };
    } else {
      all.push({ id: genId(), name, amount, date, category, bucket, type });
    }
    fSet(KEYS.transactions, all);
    close();
    renderFinance();
    showToast(existing ? 'Transaction updated' : 'Transaction added');
  });
}

// ── Bills section ──
function renderBillsSection(container) {
  const label = document.createElement('div');
  label.className = 'section-label';
  label.textContent = 'Recurring Bills';
  container.appendChild(label);

  const addBtn = document.createElement('button');
  addBtn.className = 'tr-primary-btn fn-add-btn';
  addBtn.textContent = '+ Add Bill';
  addBtn.addEventListener('click', () => openBillModal());
  container.appendChild(addBtn);

  const bills = getBills();
  if (bills.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'fn-empty-state';
    empty.textContent = 'No bills added yet. Add recurring expenses like rent, subscriptions, etc.';
    container.appendChild(empty);
    return;
  }

  const sorted = [...bills].sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''));
  const list = document.createElement('div');
  list.className = 'fn-bill-list';

  sorted.forEach(bill => {
    const row = document.createElement('div');
    row.className = 'fn-bill-row' + (bill.paid ? ' fn-bill-paid' : '');

    row.innerHTML =
      '<div class="fn-bill-left">' +
        '<div class="fn-bill-name">' + bill.name + '</div>' +
        '<div class="fn-bill-due">Due: ' + (bill.dueDate || '—') + '</div>' +
      '</div>' +
      '<div class="fn-bill-right">' +
        '<div class="fn-bill-amount">' + fmtCurrencyFull(bill.amount) + '</div>' +
        '<button class="fn-toggle-btn' + (bill.paid ? ' fn-toggle-paid' : '') + '" data-id="' + bill.id + '">' +
          (bill.paid ? '✓ Paid' : 'Mark Paid') +
        '</button>' +
        '<button class="fn-icon-btn fn-delete-btn" data-bill-id="' + bill.id + '" aria-label="Delete">✕</button>' +
      '</div>';

    list.appendChild(row);
  });

  list.addEventListener('click', e => {
    const toggleBtn = e.target.closest('.fn-toggle-btn');
    if (toggleBtn) {
      const id = toggleBtn.dataset.id;
      const all = getBills();
      const bill = all.find(b => b.id === id);
      if (bill) { bill.paid = !bill.paid; fSet(KEYS.bills, all); renderFinance(); }
      return;
    }
    const deleteBtn = e.target.closest('[data-bill-id]');
    if (deleteBtn) {
      const id = deleteBtn.dataset.billId;
      fSet(KEYS.bills, getBills().filter(b => b.id !== id));
      renderFinance();
      showToast('Bill removed');
    }
  });

  container.appendChild(list);
}

function openBillModal() {
  const overlay = document.createElement('div');
  overlay.className = 'fn-modal-overlay';

  overlay.innerHTML =
    '<div class="fn-modal card">' +
      '<div class="fn-modal-title">Add Bill</div>' +
      '<div class="fn-form-group">' +
        '<label class="fn-label">Bill Name</label>' +
        '<input class="tr-input" id="fn-bill-name" placeholder="e.g. Netflix, Rent">' +
      '</div>' +
      '<div class="fn-form-row">' +
        '<div class="fn-form-group">' +
          '<label class="fn-label">Amount (€)</label>' +
          '<input class="tr-input" id="fn-bill-amount" type="number" min="0" step="0.01" placeholder="0.00">' +
        '</div>' +
        '<div class="fn-form-group">' +
          '<label class="fn-label">Due Date</label>' +
          '<input class="tr-input" id="fn-bill-due" type="date" value="' + getToday() + '">' +
        '</div>' +
      '</div>' +
      '<div class="fn-modal-actions">' +
        '<button class="tr-secondary-btn" id="fn-bill-cancel">Cancel</button>' +
        '<button class="tr-primary-btn" id="fn-bill-save">Save</button>' +
      '</div>' +
    '</div>';

  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('fn-modal-visible'));

  const modal = overlay.querySelector('.fn-modal');
  const close = () => {
    overlay.classList.remove('fn-modal-visible');
    setTimeout(() => overlay.remove(), 240);
  };

  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  modal.querySelector('#fn-bill-cancel').addEventListener('click', close);
  modal.querySelector('#fn-bill-save').addEventListener('click', () => {
    const name = modal.querySelector('#fn-bill-name').value.trim();
    const amount = parseFloat(modal.querySelector('#fn-bill-amount').value);
    const dueDate = modal.querySelector('#fn-bill-due').value;

    if (!name) { showToast('Name is required', 'error'); return; }
    if (!amount || isNaN(amount) || amount <= 0) { showToast('Enter a valid amount', 'error'); return; }

    const all = getBills();
    all.push({ id: genId(), name, amount, dueDate, paid: false });
    fSet(KEYS.bills, all);
    close();
    renderFinance();
    showToast('Bill added');
  });
}

// ── Goals section ──
function renderGoalsSection(container) {
  const label = document.createElement('div');
  label.className = 'section-label';
  label.textContent = 'Savings Goals';
  container.appendChild(label);

  const addBtn = document.createElement('button');
  addBtn.className = 'tr-primary-btn fn-add-btn';
  addBtn.textContent = '+ Add Goal';
  addBtn.addEventListener('click', () => openGoalModal());
  container.appendChild(addBtn);

  const goals = getGoals();
  if (goals.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'fn-empty-state';
    empty.textContent = 'No goals yet. Add savings goals like Emergency Fund, Car, Vacation.';
    container.appendChild(empty);
    return;
  }

  const list = document.createElement('div');
  list.className = 'fn-goal-list';

  goals.forEach(goal => {
    const card = document.createElement('div');
    card.className = 'card fn-goal-card';
    const pct = goal.target > 0 ? Math.min(100, Math.round((goal.current / goal.target) * 100)) : 0;
    const done = pct >= 100;
    const color = done ? 'var(--success)' : pct >= 50 ? 'var(--warning)' : 'var(--accent)';

    card.innerHTML =
      '<div class="fn-goal-header">' +
        '<div class="fn-goal-name">' + (done ? '✅ ' : '') + goal.name + '</div>' +
        '<div class="fn-goal-pct" style="color:' + color + '">' + pct + '%</div>' +
      '</div>' +
      '<div class="fn-progress-wrap">' +
        '<div class="fn-progress-bar">' +
          '<div class="fn-progress-fill" style="width:' + pct + '%;background:' + color + '"></div>' +
        '</div>' +
      '</div>' +
      '<div class="fn-goal-amounts">' +
        '<span>' + fmtCurrencyFull(goal.current) + ' saved</span>' +
        '<span>' + fmtCurrencyFull(goal.target) + ' goal</span>' +
      '</div>' +
      '<div class="fn-goal-actions">' +
        '<button class="tr-secondary-btn fn-goal-update-btn fn-btn-sm" data-id="' + goal.id + '">Update Amount</button>' +
        '<button class="fn-icon-btn fn-delete-btn fn-goal-del" data-goal-id="' + goal.id + '" aria-label="Delete goal">✕</button>' +
      '</div>';

    list.appendChild(card);
  });

  list.addEventListener('click', e => {
    const updateBtn = e.target.closest('.fn-goal-update-btn');
    if (updateBtn) {
      const id = updateBtn.dataset.id;
      const goal = getGoals().find(g => g.id === id);
      if (goal) openGoalUpdateModal(goal);
      return;
    }
    const delBtn = e.target.closest('[data-goal-id]');
    if (delBtn) {
      fSet(KEYS.goals, getGoals().filter(g => g.id !== delBtn.dataset.goalId));
      renderFinance();
      showToast('Goal removed');
    }
  });

  container.appendChild(list);
}

function openGoalModal() {
  const overlay = document.createElement('div');
  overlay.className = 'fn-modal-overlay';

  overlay.innerHTML =
    '<div class="fn-modal card">' +
      '<div class="fn-modal-title">Add Savings Goal</div>' +
      '<div class="fn-form-group">' +
        '<label class="fn-label">Goal Name</label>' +
        '<input class="tr-input" id="fn-goal-name" placeholder="e.g. Emergency Fund, Car, Vacation">' +
      '</div>' +
      '<div class="fn-form-row">' +
        '<div class="fn-form-group">' +
          '<label class="fn-label">Target Amount (€)</label>' +
          '<input class="tr-input" id="fn-goal-target" type="number" min="0" step="1" placeholder="0">' +
        '</div>' +
        '<div class="fn-form-group">' +
          '<label class="fn-label">Current Amount (€)</label>' +
          '<input class="tr-input" id="fn-goal-current" type="number" min="0" step="1" placeholder="0">' +
        '</div>' +
      '</div>' +
      '<div class="fn-modal-actions">' +
        '<button class="tr-secondary-btn" id="fn-goal-cancel">Cancel</button>' +
        '<button class="tr-primary-btn" id="fn-goal-save">Save</button>' +
      '</div>' +
    '</div>';

  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('fn-modal-visible'));

  const modal = overlay.querySelector('.fn-modal');
  const close = () => {
    overlay.classList.remove('fn-modal-visible');
    setTimeout(() => overlay.remove(), 240);
  };

  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  modal.querySelector('#fn-goal-cancel').addEventListener('click', close);
  modal.querySelector('#fn-goal-save').addEventListener('click', () => {
    const name = modal.querySelector('#fn-goal-name').value.trim();
    const target = parseFloat(modal.querySelector('#fn-goal-target').value) || 0;
    const current = parseFloat(modal.querySelector('#fn-goal-current').value) || 0;

    if (!name) { showToast('Goal name is required', 'error'); return; }
    if (target <= 0) { showToast('Target must be greater than 0', 'error'); return; }

    const all = getGoals();
    all.push({ id: genId(), name, target, current });
    fSet(KEYS.goals, all);
    close();
    renderFinance();
    showToast('Goal added');
  });
}

function openGoalUpdateModal(goal) {
  const overlay = document.createElement('div');
  overlay.className = 'fn-modal-overlay';

  overlay.innerHTML =
    '<div class="fn-modal card">' +
      '<div class="fn-modal-title">Update: ' + goal.name + '</div>' +
      '<div class="fn-form-group">' +
        '<label class="fn-label">Current Amount (€)</label>' +
        '<input class="tr-input" id="fn-goal-upd-current" type="number" min="0" step="1" value="' + goal.current + '">' +
      '</div>' +
      '<div class="fn-modal-actions">' +
        '<button class="tr-secondary-btn" id="fn-gupd-cancel">Cancel</button>' +
        '<button class="tr-primary-btn" id="fn-gupd-save">Save</button>' +
      '</div>' +
    '</div>';

  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('fn-modal-visible'));

  const modal = overlay.querySelector('.fn-modal');
  const close = () => {
    overlay.classList.remove('fn-modal-visible');
    setTimeout(() => overlay.remove(), 240);
  };

  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  modal.querySelector('#fn-gupd-cancel').addEventListener('click', close);
  modal.querySelector('#fn-gupd-save').addEventListener('click', () => {
    const current = parseFloat(modal.querySelector('#fn-goal-upd-current').value) || 0;
    const all = getGoals();
    const idx = all.findIndex(g => g.id === goal.id);
    if (idx >= 0) { all[idx].current = current; fSet(KEYS.goals, all); }
    close();
    renderFinance();
    showToast('Goal updated');
  });
}

// ── Budget Settings ──
function renderBudgetSettings(container) {
  const label = document.createElement('div');
  label.className = 'section-label';
  label.textContent = 'Monthly Budget';
  container.appendChild(label);

  const budget = getBudget();
  const card = document.createElement('div');
  card.className = 'card fn-budget-card';

  const fields = [
    { id: 'fn-b-income', key: 'income', label: 'Monthly Income (€)', placeholder: '0.00' },
    { id: 'fn-b-needs', key: 'needs', label: 'Needs Budget (€)', placeholder: '0.00' },
    { id: 'fn-b-wants', key: 'wants', label: 'Wants Budget (€)', placeholder: '0.00' },
    { id: 'fn-b-debt', key: 'debtSavings', label: 'Debt / Savings Budget (€)', placeholder: '0.00' },
    { id: 'fn-b-bills', key: 'fixedBills', label: 'Fixed Bills Total (€)', placeholder: '0.00' },
    { id: 'fn-b-savings', key: 'plannedSavings', label: 'Planned Savings (€)', placeholder: '0.00' },
    { id: 'fn-b-debt-pay', key: 'debtPayments', label: 'Debt Payments (€)', placeholder: '0.00' },
  ];

  let html = '';
  fields.forEach(f => {
    html +=
      '<div class="fn-form-group">' +
        '<label class="fn-label">' + f.label + '</label>' +
        '<input class="tr-input" id="' + f.id + '" type="number" min="0" step="0.01" placeholder="' + f.placeholder + '" value="' + (budget[f.key] || '') + '">' +
      '</div>';
  });
  html += '<button class="tr-primary-btn fn-save-budget-btn">Save Budget</button>';
  card.innerHTML = html;

  card.querySelector('.fn-save-budget-btn').addEventListener('click', () => {
    const newBudget = {};
    fields.forEach(f => {
      newBudget[f.key] = parseFloat(card.querySelector('#' + f.id).value) || 0;
    });
    fSet(KEYS.budget, newBudget);
    renderFinance();
    showToast('Budget saved');
  });

  container.appendChild(card);
}
