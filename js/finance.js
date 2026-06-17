import { showToast, showLoading } from './ui.js';
import {
  dbGetFinanceBudget, dbSaveFinanceBudget,
  dbGetFinanceTransactions, dbAddFinanceTransaction, dbDeleteFinanceTransaction,
  dbGetFinanceGoals, dbAddFinanceGoal, dbUpdateFinanceGoal, dbDeleteFinanceGoal,
  dbGetFinanceBills, dbAddFinanceBill, dbToggleFinanceBill, dbDeleteFinanceBill,
  trGenId
} from './db.js';

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

function computeSummary(budget, transactions, bills) {
  const income = budget.income || 0;
  const fixedBills = budget.fixedBills || 0;
  const plannedSavings = budget.plannedSavings || 0;
  const debtPayments = budget.debtPayments || 0;

  const month = getMonthKey();
  const monthTxns = transactions.filter(t => t.date && t.date.startsWith(month));

  let spentNeeds = 0, spentWants = 0, spentDebtSavings = 0;
  monthTxns.forEach(t => {
    if (t.type === 'income') return;
    if (t.bucket === 'needs') spentNeeds += t.amount;
    else if (t.bucket === 'wants') spentWants += t.amount;
    else if (t.bucket === 'debtSavings') spentDebtSavings += t.amount;
  });

  const unpaidBills = bills.filter(b => !b.paid).reduce((a, b) => a + (b.amount || 0), 0);
  const spentThisMonth = spentNeeds + spentWants + spentDebtSavings;
  const safeToSpend = income - fixedBills - plannedSavings - debtPayments - spentWants - spentNeeds;

  return {
    income, safeToSpend, spentThisMonth, unpaidBills,
    spentNeeds, spentWants, spentDebtSavings,
    budgetNeeds: budget.needs || 0,
    budgetWants: budget.wants || 0,
    budgetDebtSavings: budget.debtSavings || 0,
  };
}

function progressBar(spent, budget) {
  const pct = budget > 0 ? Math.min(100, Math.round((spent / budget) * 100)) : 0;
  let color = 'var(--success)', status = 'On track';
  if (pct >= 100) { color = 'var(--danger)'; status = 'Over budget'; }
  else if (pct >= 80) { color = 'var(--warning)'; status = 'Close to limit'; }

  const wrap = document.createElement('div');
  wrap.className = 'fn-progress-wrap';
  wrap.innerHTML =
    '<div class="fn-progress-bar"><div class="fn-progress-fill" style="width:' + pct + '%;background:' + color + '"></div></div>' +
    '<div class="fn-progress-meta">' +
      '<span class="fn-progress-status" style="color:' + color + '">' + status + '</span>' +
      '<span class="fn-progress-pct">' + pct + '%</span>' +
    '</div>';
  return wrap;
}

function generateInsight(s) {
  if (!s.income) return 'Add your income and first transactions to get insights.';
  if (s.safeToSpend < 0) return '⚠️ You are over budget. Review your wants and subscriptions.';
  const wantsPct = s.budgetWants > 0 ? s.spentWants / s.budgetWants : 0;
  const needsPct = s.budgetNeeds > 0 ? s.spentNeeds / s.budgetNeeds : 0;
  if (wantsPct >= 0.8) return '👀 Your wants spending is getting high. Slow down for the rest of the month.';
  if (needsPct >= 0.9) return '💸 Needs are almost maxed. Watch your essentials spending.';
  if (s.safeToSpend > s.income * 0.3) return '✅ Good job — you\'re well within budget. Stay the course.';
  return '📊 Tracking well. Keep logging transactions to stay on top of your finances.';
}

// ── Main render ──
export async function renderFinance() {
  const container = document.getElementById('viewFinanceContent');
  showLoading(container);

  let budget, transactions, goals, bills;
  try {
    [budget, transactions, goals, bills] = await Promise.all([
      dbGetFinanceBudget(),
      dbGetFinanceTransactions(),
      dbGetFinanceGoals(),
      dbGetFinanceBills(),
    ]);
  } catch(e) {
    container.innerHTML = '<div class="fn-empty-state">Failed to load finance data. Check your connection.</div>';
    return;
  }

  container.innerHTML = '';
  const summary = computeSummary(budget, transactions, bills);
  const hasBudget = budget.income > 0;

  // ─ Safe to Spend hero ─
  const heroColor = summary.safeToSpend < 0 ? 'var(--danger)' : summary.safeToSpend < summary.income * 0.1 ? 'var(--warning)' : 'var(--success)';
  const hero = document.createElement('div');
  hero.className = 'card fn-hero-card';
  hero.innerHTML =
    '<div class="fn-hero-label">Safe to Spend</div>' +
    '<div class="fn-hero-amount" style="color:' + heroColor + '">' + fmtCurrencyFull(summary.safeToSpend) + '</div>' +
    '<div class="fn-hero-sub">' + (hasBudget ? 'This month · ' + getMonthKey() : 'Set your budget below') + '</div>';
  container.appendChild(hero);

  // ─ Summary row ─
  const summaryRow = document.createElement('div');
  summaryRow.className = 'fn-summary-row';
  [
    { label: 'Monthly Income', value: fmtCurrency(summary.income), color: 'var(--success)' },
    { label: 'Spent', value: fmtCurrency(summary.spentThisMonth), color: 'var(--text-primary)' },
    { label: 'Bills Left', value: fmtCurrency(summary.unpaidBills), color: summary.unpaidBills > 0 ? 'var(--warning)' : 'var(--text-secondary)' },
  ].forEach(({ label, value, color }) => {
    const card = document.createElement('div');
    card.className = 'fn-sum-card';
    card.innerHTML = '<div class="fn-sum-value" style="color:' + color + '">' + value + '</div><div class="fn-sum-label">' + label + '</div>';
    summaryRow.appendChild(card);
  });
  container.appendChild(summaryRow);

  // ─ Insight ─
  const insight = document.createElement('div');
  insight.className = 'card fn-insight-card';
  insight.innerHTML = '<div class="fn-insight-label">Finance Insight</div><div class="fn-insight-text">' + generateInsight(summary) + '</div>';
  container.appendChild(insight);

  // ─ Budget buckets ─
  const buckLabel = document.createElement('div');
  buckLabel.className = 'section-label';
  buckLabel.textContent = 'Budget Buckets';
  container.appendChild(buckLabel);

  [
    { label: '🏠 Needs', spent: summary.spentNeeds, bgt: summary.budgetNeeds, desc: 'Rent, groceries, utilities' },
    { label: '🎉 Wants', spent: summary.spentWants, bgt: summary.budgetWants, desc: 'Dining, entertainment, shopping' },
    { label: '💰 Debt / Savings', spent: summary.spentDebtSavings, bgt: summary.budgetDebtSavings, desc: 'Payments & savings deposits' },
  ].forEach(({ label, spent, bgt, desc }) => {
    const card = document.createElement('div');
    card.className = 'card fn-bucket-card';
    const remaining = bgt - spent;
    card.innerHTML =
      '<div class="fn-bucket-header">' +
        '<div><div class="fn-bucket-title">' + label + '</div><div class="fn-bucket-desc">' + desc + '</div></div>' +
        '<div class="fn-bucket-amounts"><span class="fn-bucket-spent">' + fmtCurrency(spent) + '</span><span class="fn-bucket-sep"> / </span><span class="fn-bucket-budget">' + fmtCurrency(bgt) + '</span></div>' +
      '</div>';
    if (bgt > 0) {
      card.appendChild(progressBar(spent, bgt));
      const rem = document.createElement('div');
      rem.className = 'fn-bucket-remaining';
      rem.style.color = remaining >= 0 ? 'var(--text-secondary)' : 'var(--danger)';
      rem.textContent = remaining >= 0 ? fmtCurrency(remaining) + ' remaining' : fmtCurrency(Math.abs(remaining)) + ' over budget';
      card.appendChild(rem);
    } else {
      const hint = document.createElement('div');
      hint.className = 'fn-empty-hint';
      hint.textContent = 'No budget set — update settings below.';
      card.appendChild(hint);
    }
    container.appendChild(card);
  });

  // ─ Transactions ─
  renderTransactions(container, transactions);

  // ─ Bills ─
  renderBills(container, bills);

  // ─ Goals ─
  renderGoals(container, goals);

  // ─ Budget settings ─
  renderBudgetSettings(container, budget);
}

// ── Transactions ──
function renderTransactions(container, transactions) {
  const label = document.createElement('div');
  label.className = 'section-label';
  label.textContent = 'Transactions';
  container.appendChild(label);

  const addBtn = document.createElement('button');
  addBtn.className = 'tr-primary-btn fn-add-btn';
  addBtn.textContent = '+ Add Transaction';
  addBtn.addEventListener('click', () => openTransactionModal());
  container.appendChild(addBtn);

  const month = getMonthKey();
  const monthTxns = transactions.filter(t => t.date && t.date.startsWith(month));

  if (monthTxns.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'fn-empty-state';
    empty.textContent = 'No transactions yet. Add your first expense or income.';
    container.appendChild(empty);
    return;
  }

  const list = document.createElement('div');
  list.className = 'fn-txn-list';
  const bucketEmoji = { needs: '🏠', wants: '🎉', debtSavings: '💰' };

  monthTxns.forEach(txn => {
    const row = document.createElement('div');
    row.className = 'fn-txn-row';
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
        '<button class="fn-icon-btn" data-del-txn="' + txn.id + '" aria-label="Delete">✕</button>' +
      '</div>';
    list.appendChild(row);
  });

  list.addEventListener('click', async e => {
    const btn = e.target.closest('[data-del-txn]');
    if (!btn) return;
    btn.disabled = true;
    try {
      await dbDeleteFinanceTransaction(btn.dataset.delTxn);
      await renderFinance();
      showToast('Transaction deleted');
    } catch(err) {
      showToast('Delete failed: ' + err.message, 'error');
      btn.disabled = false;
    }
  });

  container.appendChild(list);
}

function openTransactionModal() {
  const overlay = document.createElement('div');
  overlay.className = 'fn-modal-overlay';
  overlay.innerHTML =
    '<div class="fn-modal card">' +
      '<div class="fn-modal-title">Add Transaction</div>' +
      '<div class="fn-form-group"><label class="fn-label">Name</label><input class="tr-input" id="fn-txn-name" placeholder="e.g. Groceries"></div>' +
      '<div class="fn-form-row">' +
        '<div class="fn-form-group"><label class="fn-label">Amount (€)</label><input class="tr-input" id="fn-txn-amount" type="number" min="0" step="0.01" placeholder="0.00"></div>' +
        '<div class="fn-form-group"><label class="fn-label">Date</label><input class="tr-input" id="fn-txn-date" type="date" value="' + getToday() + '"></div>' +
      '</div>' +
      '<div class="fn-form-group"><label class="fn-label">Category (optional)</label><input class="tr-input" id="fn-txn-category" placeholder="e.g. Food, Transport"></div>' +
      '<div class="fn-form-row">' +
        '<div class="fn-form-group"><label class="fn-label">Bucket</label><select class="tr-input" id="fn-txn-bucket"><option value="needs">Needs</option><option value="wants">Wants</option><option value="debtSavings">Debt / Savings</option></select></div>' +
        '<div class="fn-form-group"><label class="fn-label">Type</label><select class="tr-input" id="fn-txn-type"><option value="expense">Expense</option><option value="income">Income</option></select></div>' +
      '</div>' +
      '<div class="fn-modal-actions"><button class="tr-secondary-btn" id="fn-txn-cancel">Cancel</button><button class="tr-primary-btn" id="fn-txn-save">Save</button></div>' +
    '</div>';

  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('fn-modal-visible'));
  const modal = overlay.querySelector('.fn-modal');

  const close = () => { overlay.classList.remove('fn-modal-visible'); setTimeout(() => overlay.remove(), 240); };
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  modal.querySelector('#fn-txn-cancel').addEventListener('click', close);
  modal.querySelector('#fn-txn-save').addEventListener('click', async () => {
    const name = modal.querySelector('#fn-txn-name').value.trim();
    const amount = parseFloat(modal.querySelector('#fn-txn-amount').value);
    const date = modal.querySelector('#fn-txn-date').value;
    const category = modal.querySelector('#fn-txn-category').value.trim();
    const bucket = modal.querySelector('#fn-txn-bucket').value;
    const type = modal.querySelector('#fn-txn-type').value;
    if (!name) { showToast('Name is required', 'error'); return; }
    if (!amount || isNaN(amount) || amount <= 0) { showToast('Enter a valid amount', 'error'); return; }
    if (!date) { showToast('Date is required', 'error'); return; }
    const saveBtn = modal.querySelector('#fn-txn-save');
    saveBtn.disabled = true;
    try {
      await dbAddFinanceTransaction({ id: trGenId(), name, amount, date, category, bucket, type });
      close();
      await renderFinance();
      showToast('Transaction added');
    } catch(err) {
      showToast('Save failed: ' + err.message, 'error');
      saveBtn.disabled = false;
    }
  });
}

// ── Bills ──
function renderBills(container, bills) {
  const label = document.createElement('div');
  label.className = 'section-label';
  label.textContent = 'Recurring Bills';
  container.appendChild(label);

  const addBtn = document.createElement('button');
  addBtn.className = 'tr-primary-btn fn-add-btn';
  addBtn.textContent = '+ Add Bill';
  addBtn.addEventListener('click', () => openBillModal());
  container.appendChild(addBtn);

  if (bills.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'fn-empty-state';
    empty.textContent = 'No bills added yet. Add recurring expenses like rent, subscriptions, etc.';
    container.appendChild(empty);
    return;
  }

  const list = document.createElement('div');
  list.className = 'fn-bill-list';

  bills.forEach(bill => {
    const row = document.createElement('div');
    row.className = 'fn-bill-row' + (bill.paid ? ' fn-bill-paid' : '');
    row.innerHTML =
      '<div class="fn-bill-left">' +
        '<div class="fn-bill-name">' + bill.name + '</div>' +
        '<div class="fn-bill-due">Due: ' + (bill.due_date || '—') + '</div>' +
      '</div>' +
      '<div class="fn-bill-right">' +
        '<div class="fn-bill-amount">' + fmtCurrencyFull(bill.amount) + '</div>' +
        '<button class="fn-toggle-btn' + (bill.paid ? ' fn-toggle-paid' : '') + '" data-toggle-bill="' + bill.id + '" data-paid="' + bill.paid + '">' + (bill.paid ? '✓ Paid' : 'Mark Paid') + '</button>' +
        '<button class="fn-icon-btn" data-del-bill="' + bill.id + '" aria-label="Delete">✕</button>' +
      '</div>';
    list.appendChild(row);
  });

  list.addEventListener('click', async e => {
    const toggleBtn = e.target.closest('[data-toggle-bill]');
    if (toggleBtn) {
      toggleBtn.disabled = true;
      const id = toggleBtn.dataset.toggleBill;
      const paid = toggleBtn.dataset.paid === 'true';
      try { await dbToggleFinanceBill(id, !paid); await renderFinance(); } catch(err) { showToast('Update failed: ' + err.message, 'error'); toggleBtn.disabled = false; }
      return;
    }
    const delBtn = e.target.closest('[data-del-bill]');
    if (delBtn) {
      delBtn.disabled = true;
      try { await dbDeleteFinanceBill(delBtn.dataset.delBill); await renderFinance(); showToast('Bill removed'); } catch(err) { showToast('Delete failed: ' + err.message, 'error'); delBtn.disabled = false; }
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
      '<div class="fn-form-group"><label class="fn-label">Bill Name</label><input class="tr-input" id="fn-bill-name" placeholder="e.g. Netflix, Rent"></div>' +
      '<div class="fn-form-row">' +
        '<div class="fn-form-group"><label class="fn-label">Amount (€)</label><input class="tr-input" id="fn-bill-amount" type="number" min="0" step="0.01" placeholder="0.00"></div>' +
        '<div class="fn-form-group"><label class="fn-label">Due Date</label><input class="tr-input" id="fn-bill-due" type="date" value="' + getToday() + '"></div>' +
      '</div>' +
      '<div class="fn-modal-actions"><button class="tr-secondary-btn" id="fn-bill-cancel">Cancel</button><button class="tr-primary-btn" id="fn-bill-save">Save</button></div>' +
    '</div>';

  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('fn-modal-visible'));
  const modal = overlay.querySelector('.fn-modal');

  const close = () => { overlay.classList.remove('fn-modal-visible'); setTimeout(() => overlay.remove(), 240); };
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  modal.querySelector('#fn-bill-cancel').addEventListener('click', close);
  modal.querySelector('#fn-bill-save').addEventListener('click', async () => {
    const name = modal.querySelector('#fn-bill-name').value.trim();
    const amount = parseFloat(modal.querySelector('#fn-bill-amount').value);
    const dueDate = modal.querySelector('#fn-bill-due').value;
    if (!name) { showToast('Name is required', 'error'); return; }
    if (!amount || isNaN(amount) || amount <= 0) { showToast('Enter a valid amount', 'error'); return; }
    const saveBtn = modal.querySelector('#fn-bill-save');
    saveBtn.disabled = true;
    try {
      await dbAddFinanceBill({ id: trGenId(), name, amount, dueDate });
      close();
      await renderFinance();
      showToast('Bill added');
    } catch(err) {
      showToast('Save failed: ' + err.message, 'error');
      saveBtn.disabled = false;
    }
  });
}

// ── Goals ──
function renderGoals(container, goals) {
  const label = document.createElement('div');
  label.className = 'section-label';
  label.textContent = 'Savings Goals';
  container.appendChild(label);

  const addBtn = document.createElement('button');
  addBtn.className = 'tr-primary-btn fn-add-btn';
  addBtn.textContent = '+ Add Goal';
  addBtn.addEventListener('click', () => openGoalModal());
  container.appendChild(addBtn);

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
      '<div class="fn-progress-wrap"><div class="fn-progress-bar"><div class="fn-progress-fill" style="width:' + pct + '%;background:' + color + '"></div></div></div>' +
      '<div class="fn-goal-amounts"><span>' + fmtCurrencyFull(goal.current) + ' saved</span><span>' + fmtCurrencyFull(goal.target) + ' goal</span></div>' +
      '<div class="fn-goal-actions">' +
        '<button class="tr-secondary-btn fn-btn-sm" data-upd-goal="' + goal.id + '" data-goal-cur="' + goal.current + '">Update Amount</button>' +
        '<button class="fn-icon-btn" data-del-goal="' + goal.id + '" aria-label="Delete">✕</button>' +
      '</div>';
    list.appendChild(card);
  });

  list.addEventListener('click', async e => {
    const updBtn = e.target.closest('[data-upd-goal]');
    if (updBtn) {
      openGoalUpdateModal(updBtn.dataset.updGoal, updBtn.dataset.goalName || '', parseFloat(updBtn.dataset.goalCur) || 0);
      return;
    }
    const delBtn = e.target.closest('[data-del-goal]');
    if (delBtn) {
      delBtn.disabled = true;
      try { await dbDeleteFinanceGoal(delBtn.dataset.delGoal); await renderFinance(); showToast('Goal removed'); } catch(err) { showToast('Delete failed: ' + err.message, 'error'); delBtn.disabled = false; }
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
      '<div class="fn-form-group"><label class="fn-label">Goal Name</label><input class="tr-input" id="fn-goal-name" placeholder="e.g. Emergency Fund, Car, Vacation"></div>' +
      '<div class="fn-form-row">' +
        '<div class="fn-form-group"><label class="fn-label">Target (€)</label><input class="tr-input" id="fn-goal-target" type="number" min="0" step="1" placeholder="0"></div>' +
        '<div class="fn-form-group"><label class="fn-label">Current (€)</label><input class="tr-input" id="fn-goal-current" type="number" min="0" step="1" placeholder="0"></div>' +
      '</div>' +
      '<div class="fn-modal-actions"><button class="tr-secondary-btn" id="fn-goal-cancel">Cancel</button><button class="tr-primary-btn" id="fn-goal-save">Save</button></div>' +
    '</div>';

  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('fn-modal-visible'));
  const modal = overlay.querySelector('.fn-modal');

  const close = () => { overlay.classList.remove('fn-modal-visible'); setTimeout(() => overlay.remove(), 240); };
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  modal.querySelector('#fn-goal-cancel').addEventListener('click', close);
  modal.querySelector('#fn-goal-save').addEventListener('click', async () => {
    const name = modal.querySelector('#fn-goal-name').value.trim();
    const target = parseFloat(modal.querySelector('#fn-goal-target').value) || 0;
    const current = parseFloat(modal.querySelector('#fn-goal-current').value) || 0;
    if (!name) { showToast('Goal name is required', 'error'); return; }
    if (target <= 0) { showToast('Target must be greater than 0', 'error'); return; }
    const saveBtn = modal.querySelector('#fn-goal-save');
    saveBtn.disabled = true;
    try {
      await dbAddFinanceGoal({ id: trGenId(), name, target, current });
      close();
      await renderFinance();
      showToast('Goal added');
    } catch(err) {
      showToast('Save failed: ' + err.message, 'error');
      saveBtn.disabled = false;
    }
  });
}

function openGoalUpdateModal(id, name, current) {
  const overlay = document.createElement('div');
  overlay.className = 'fn-modal-overlay';
  overlay.innerHTML =
    '<div class="fn-modal card">' +
      '<div class="fn-modal-title">Update Goal</div>' +
      '<div class="fn-form-group"><label class="fn-label">Current Amount (€)</label><input class="tr-input" id="fn-gupd-current" type="number" min="0" step="1" value="' + current + '"></div>' +
      '<div class="fn-modal-actions"><button class="tr-secondary-btn" id="fn-gupd-cancel">Cancel</button><button class="tr-primary-btn" id="fn-gupd-save">Save</button></div>' +
    '</div>';

  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('fn-modal-visible'));
  const modal = overlay.querySelector('.fn-modal');

  const close = () => { overlay.classList.remove('fn-modal-visible'); setTimeout(() => overlay.remove(), 240); };
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  modal.querySelector('#fn-gupd-cancel').addEventListener('click', close);
  modal.querySelector('#fn-gupd-save').addEventListener('click', async () => {
    const newCurrent = parseFloat(modal.querySelector('#fn-gupd-current').value) || 0;
    const saveBtn = modal.querySelector('#fn-gupd-save');
    saveBtn.disabled = true;
    try {
      await dbUpdateFinanceGoal(id, newCurrent);
      close();
      await renderFinance();
      showToast('Goal updated');
    } catch(err) {
      showToast('Save failed: ' + err.message, 'error');
      saveBtn.disabled = false;
    }
  });
}

// ── Budget settings ──
function renderBudgetSettings(container, budget) {
  const label = document.createElement('div');
  label.className = 'section-label';
  label.textContent = 'Monthly Budget';
  container.appendChild(label);

  const card = document.createElement('div');
  card.className = 'card fn-budget-card';

  const fields = [
    { id: 'fn-b-income',   key: 'income',         label: 'Monthly Income (€)' },
    { id: 'fn-b-needs',    key: 'needs',           label: 'Needs Budget (€)' },
    { id: 'fn-b-wants',    key: 'wants',           label: 'Wants Budget (€)' },
    { id: 'fn-b-debt',     key: 'debtSavings',     label: 'Debt / Savings Budget (€)' },
    { id: 'fn-b-bills',    key: 'fixedBills',      label: 'Fixed Bills Total (€)' },
    { id: 'fn-b-savings',  key: 'plannedSavings',  label: 'Planned Savings (€)' },
    { id: 'fn-b-debtpay',  key: 'debtPayments',    label: 'Debt Payments (€)' },
  ];

  card.innerHTML = fields.map(f =>
    '<div class="fn-form-group">' +
      '<label class="fn-label">' + f.label + '</label>' +
      '<input class="tr-input" id="' + f.id + '" type="number" min="0" step="0.01" placeholder="0.00" value="' + (budget[f.key] || '') + '">' +
    '</div>'
  ).join('') + '<button class="tr-primary-btn fn-save-budget-btn">Save Budget</button>';

  card.querySelector('.fn-save-budget-btn').addEventListener('click', async () => {
    const saveBtn = card.querySelector('.fn-save-budget-btn');
    saveBtn.disabled = true;
    const data = {};
    fields.forEach(f => { data[f.key] = parseFloat(card.querySelector('#' + f.id).value) || 0; });
    try {
      await dbSaveFinanceBudget(data);
      await renderFinance();
      showToast('Budget saved');
    } catch(err) {
      showToast('Save failed: ' + err.message, 'error');
      saveBtn.disabled = false;
    }
  });

  container.appendChild(card);
}
