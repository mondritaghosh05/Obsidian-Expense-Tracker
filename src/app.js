import { initAuth } from './firebase.js';
import { 
  subscribeToExpenses, 
  addExpenseDoc, 
  updateExpenseDoc, 
  deleteExpenseDoc 
} from './services/expenseService.js';
import { 
  getActiveCurrency, 
  setActiveCurrency, 
  formatCurrency 
} from './services/fxService.js';

let allExpenses = [];
let currentFilter = 'all';
let searchQuery = '';
let editingExpenseId = null;

// Category metadata helper
const CATEGORY_STYLES = {
  Software: { bg: 'bg-tertiary-container/30', text: 'text-on-surface', icon: 'draw', iconColor: 'text-primary-fixed' },
  Housing: { bg: 'bg-primary-container/20', text: 'text-primary-container', icon: 'apartment', iconColor: 'text-primary' },
  Dining: { bg: 'bg-tertiary-container/30', text: 'text-on-surface', icon: 'coffee', iconColor: 'text-primary' },
  Provisions: { bg: 'bg-secondary-container/30', text: 'text-secondary', icon: 'local_grocery_store', iconColor: 'text-secondary' },
  Transit: { bg: 'bg-error-container/30', text: 'text-error', icon: 'local_taxi', iconColor: 'text-error' },
  Health: { bg: 'bg-secondary-container/30', text: 'text-secondary', icon: 'fitness_center', iconColor: 'text-secondary' },
  Insurance: { bg: 'bg-secondary-container/30', text: 'text-secondary', icon: 'shield', iconColor: 'text-primary-container' },
  'Dev Ops': { bg: 'bg-tertiary-container/30', text: 'text-on-surface', icon: 'code', iconColor: 'text-on-surface' }
};

const DEFAULT_CATEGORY_STYLE = { bg: 'bg-surface-container-highest', text: 'text-on-surface', icon: 'receipt_long', iconColor: 'text-primary' };

function getCategoryStyle(cat) {
  return CATEGORY_STYLES[cat] || DEFAULT_CATEGORY_STYLE;
}

// UI Elements
const totalOutflowMetric = document.getElementById('totalOutflowMetric');
const regularMetric = document.getElementById('regularMetric');
const monthlyMetric = document.getElementById('monthlyMetric');
const yearlyAmortMetric = document.getElementById('yearlyAmortMetric');

const expenseRowsContainer = document.getElementById('expenseRowsContainer');
const displayedCount = document.getElementById('displayedCount');
const tableSearchInput = document.getElementById('tableSearchInput');

const expenseModal = document.getElementById('expenseModal');
const openAddModalBtn = document.getElementById('openAddModalBtn');
const closeModalBtn = document.getElementById('closeModalBtn');
const cancelModalBtn = document.getElementById('cancelModalBtn');
const expenseForm = document.getElementById('expenseForm');
const modalHeading = document.getElementById('modalHeading');
const modalCurrencySymbol = document.getElementById('modalCurrencySymbol');

const toast = document.getElementById('toastNotification');
const toastMessage = document.getElementById('toastMessage');

function showToast(msg) {
  if (!toast || !toastMessage) return;
  toastMessage.textContent = msg;
  toast.classList.remove('translate-y-20', 'opacity-0');
  toast.classList.add('translate-y-0', 'opacity-100');
  setTimeout(() => {
    toast.classList.add('translate-y-20', 'opacity-0');
    toast.classList.remove('translate-y-0', 'opacity-100');
  }, 2500);
}

// Update Summary Metrics
function updateMetrics() {
  let regularUsdMonthly = 0;
  let monthlyUsdFixed = 0;
  let yearlyUsdAmortized = 0;

  allExpenses.forEach(exp => {
    const amt = parseFloat(exp.amount) || 0;
    if (exp.cadence === 'regular') {
      // Estimate monthly equivalent based on due date description or average
      if ((exp.dueDate || '').toLowerCase().includes('daily')) {
        regularUsdMonthly += amt * 30;
      } else if ((exp.dueDate || '').toLowerCase().includes('sunday') || (exp.dueDate || '').toLowerCase().includes('wk') || (exp.dueDate || '').toLowerCase().includes('weekly')) {
        regularUsdMonthly += amt * 4.33;
      } else {
        regularUsdMonthly += amt * 4.33;
      }
    } else if (exp.cadence === 'monthly') {
      monthlyUsdFixed += amt;
    } else if (exp.cadence === 'yearly') {
      yearlyUsdAmortized += amt / 12;
    }
  });

  const totalMonthlyOutflowUsd = regularUsdMonthly + monthlyUsdFixed + yearlyUsdAmortized;

  if (totalOutflowMetric) totalOutflowMetric.textContent = formatCurrency(totalMonthlyOutflowUsd);
  if (regularMetric) regularMetric.textContent = formatCurrency(regularUsdMonthly);
  if (monthlyMetric) monthlyMetric.textContent = formatCurrency(monthlyUsdFixed);
  if (yearlyAmortMetric) yearlyAmortMetric.textContent = formatCurrency(yearlyUsdAmortized);
}

// Update Donut SVG Chart & Category Breakdown
function updateDonutChart() {
  const categoryTotals = {
    Housing: 0,
    Software: 0,
    Dining: 0,
    Transit: 0,
    Other: 0
  };

  let grandTotal = 0;
  allExpenses.forEach(exp => {
    const amt = parseFloat(exp.amount) || 0;
    const cat = exp.category;
    if (cat === 'Housing') categoryTotals.Housing += amt;
    else if (cat === 'Software' || cat === 'Dev Ops') categoryTotals.Software += amt;
    else if (cat === 'Dining' || cat === 'Provisions') categoryTotals.Dining += amt;
    else if (cat === 'Transit') categoryTotals.Transit += amt;
    else categoryTotals.Other += amt;
    grandTotal += amt;
  });

  if (grandTotal === 0) grandTotal = 1;

  const housingPct = Math.round((categoryTotals.Housing / grandTotal) * 100);
  const softwarePct = Math.round((categoryTotals.Software / grandTotal) * 100);
  const diningPct = Math.round((categoryTotals.Dining / grandTotal) * 100);
  const transitPct = Math.round((categoryTotals.Transit / grandTotal) * 100);
  const otherPct = Math.max(0, 100 - (housingPct + softwarePct + diningPct + transitPct));

  // Update DOM percentages if elements exist
  const housingEl = document.getElementById('pctHousing');
  const softwareEl = document.getElementById('pctSoftware');
  const diningEl = document.getElementById('pctDining');
  const transitEl = document.getElementById('pctTransit');

  if (housingEl) housingEl.textContent = `${housingPct}%`;
  if (softwareEl) softwareEl.textContent = `${softwarePct}%`;
  if (diningEl) diningEl.textContent = `${diningPct}%`;
  if (transitEl) transitEl.textContent = `${transitPct}%`;

  // SVG Circle Stroke Adjustments (Circumference ~ 238.76)
  const circ = 238.76;
  let offset = 0;

  const circles = [
    { id: 'donutCircleHousing', pct: housingPct },
    { id: 'donutCircleSoftware', pct: softwarePct },
    { id: 'donutCircleDining', pct: diningPct },
    { id: 'donutCircleTransit', pct: transitPct },
    { id: 'donutCircleOther', pct: otherPct }
  ];

  circles.forEach(item => {
    const elem = document.getElementById(item.id);
    if (elem) {
      const strokeLen = (item.pct / 100) * circ;
      elem.setAttribute('stroke-dasharray', `${strokeLen.toFixed(1)} ${circ.toFixed(1)}`);
      elem.setAttribute('stroke-dashoffset', `-${offset.toFixed(1)}`);
      offset += strokeLen;
    }
  });
}

// Render Table Rows
function renderTable() {
  if (!expenseRowsContainer) return;

  const filtered = allExpenses.filter(exp => {
    const matchesTab = (currentFilter === 'all' || exp.cadence === currentFilter);
    const q = searchQuery.toLowerCase();
    const matchesSearch = !q || 
      (exp.title || '').toLowerCase().includes(q) || 
      (exp.category || '').toLowerCase().includes(q) || 
      (exp.paymentMethod || '').toLowerCase().includes(q);
    return matchesTab && matchesSearch;
  });

  if (displayedCount) displayedCount.textContent = filtered.length;

  expenseRowsContainer.innerHTML = filtered.map(exp => {
    const style = getCategoryStyle(exp.category);
    const activeAmt = formatCurrency(parseFloat(exp.amount) || 0);
    const baseUsd = '$' + (parseFloat(exp.amount) || 0).toFixed(2);
    
    let cadenceBadge = '';
    if (exp.cadence === 'regular') {
      cadenceBadge = '<span class="px-2 py-0.5 rounded-md font-label-caps text-label-caps font-semibold bg-secondary/15 text-secondary">Regular</span>';
    } else if (exp.cadence === 'monthly') {
      cadenceBadge = '<span class="px-2 py-0.5 rounded-md font-label-caps text-label-caps font-semibold bg-primary/20 text-primary">Monthly</span>';
    } else {
      cadenceBadge = '<span class="px-2 py-0.5 rounded-md font-label-caps text-label-caps font-semibold bg-tertiary-container/40 text-on-surface">Yearly</span>';
    }

    return `
      <tr class="expense-row group hover:bg-surface-container-high/30 transition-colors" data-id="${exp.id}">
        <td class="py-3.5 px-space-md flex items-center gap-space-sm">
          <div class="w-7 h-7 rounded-lg bg-surface-container-highest flex items-center justify-center ${style.iconColor}">
            <span class="material-symbols-outlined text-[16px]">${style.icon}</span>
          </div>
          <div class="flex flex-col">
            <span class="font-title-md text-title-md text-on-surface font-medium">${exp.title}</span>
            <span class="font-body-sm text-body-sm text-on-surface-variant">${exp.note || exp.category + ' Entry'}</span>
          </div>
        </td>
        <td class="py-3.5 px-space-sm">
          <span class="px-2 py-0.5 rounded-full font-label-caps text-label-caps font-semibold ${style.bg} ${style.text}">${exp.category}</span>
        </td>
        <td class="py-3.5 px-space-sm">
          ${cadenceBadge}
        </td>
        <td class="py-3.5 px-space-sm font-label-numeric-sm text-label-numeric-sm text-on-surface-variant">${exp.dueDate || 'Pending'}</td>
        <td class="py-3.5 px-space-sm text-right font-label-numeric-md text-label-numeric-md font-bold text-on-surface active-amount">${activeAmt}</td>
        <td class="py-3.5 px-space-sm text-right font-label-numeric-sm text-label-numeric-sm text-on-surface-variant">${baseUsd}</td>
        <td class="py-3.5 px-space-sm">
          <span class="font-label-numeric-sm text-label-numeric-sm text-on-surface-variant flex items-center gap-1">
            <span class="material-symbols-outlined text-[14px]">credit_card</span>${exp.paymentMethod || 'Credit Card'}
          </span>
        </td>
        <td class="py-3.5 px-space-md text-right">
          <div class="flex items-center justify-end gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
            <button class="edit-btn p-1 rounded-md text-on-surface-variant hover:text-primary hover:bg-surface-container-high transition-colors" title="Edit" data-id="${exp.id}">
              <span class="material-symbols-outlined text-[18px]">edit</span>
            </button>
            <button class="delete-btn p-1 rounded-md text-on-surface-variant hover:text-error hover:bg-surface-container-high transition-colors" title="Delete" data-id="${exp.id}">
              <span class="material-symbols-outlined text-[18px]">delete</span>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function updateUI() {
  updateMetrics();
  updateDonutChart();
  renderTable();
}

// Modal Handlers
function openModal(editId = null) {
  editingExpenseId = editId;
  const activeCurr = getActiveCurrency();
  if (modalCurrencySymbol) modalCurrencySymbol.textContent = activeCurr.symbol;

  if (editId) {
    const item = allExpenses.find(e => e.id === editId);
    if (item) {
      if (modalHeading) modalHeading.textContent = 'Edit Ledger Expense';
      document.getElementById('inputTitle').value = item.title;
      document.getElementById('inputCategory').value = item.category;
      document.getElementById('inputCadence').value = item.cadence;
      document.getElementById('inputAmount').value = item.amount;
      document.getElementById('inputDate').value = item.dueDate || '';
      document.getElementById('inputMethod').value = item.paymentMethod || 'Amex Corp (••9901)';
    }
  } else {
    if (modalHeading) modalHeading.textContent = 'Add Scheduled Expense';
    expenseForm.reset();
  }

  if (expenseModal) {
    expenseModal.classList.remove('hidden');
    expenseModal.classList.add('flex');
  }
}

function closeModal() {
  if (expenseModal) {
    expenseModal.classList.add('hidden');
    expenseModal.classList.remove('flex');
  }
  editingExpenseId = null;
  expenseForm.reset();
}

// Setup Event Listeners
function setupEventListeners() {
  // Currency Switcher
  const currencyButtons = document.querySelectorAll('.currency-btn');
  currencyButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      currencyButtons.forEach(b => {
        b.classList.remove('bg-primary-container', 'text-on-primary-container');
        b.classList.add('text-on-surface-variant');
      });
      btn.classList.add('bg-primary-container', 'text-on-primary-container');
      btn.classList.remove('text-on-surface-variant');

      const code = btn.getAttribute('data-currency');
      const updatedCurr = setActiveCurrency(code);
      updateUI();
      showToast(`Currency converted to ${updatedCurr.code} (${updatedCurr.symbol})`);
    });
  });

  // Ledger Filter Tabs
  const ledgerTabs = document.querySelectorAll('.ledger-tab');
  ledgerTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      ledgerTabs.forEach(t => {
        t.classList.remove('bg-surface-container-highest', 'text-on-surface', 'shadow-sm');
        t.classList.add('text-on-surface-variant');
      });
      tab.classList.add('bg-surface-container-highest', 'text-on-surface', 'shadow-sm');
      tab.classList.remove('text-on-surface-variant');

      currentFilter = tab.getAttribute('data-filter');
      renderTable();
    });
  });

  // Table Search Input
  if (tableSearchInput) {
    tableSearchInput.addEventListener('input', (e) => {
      searchQuery = e.target.value || '';
      renderTable();
    });
  }

  // Modal Triggers
  if (openAddModalBtn) openAddModalBtn.addEventListener('click', () => openModal());
  if (closeModalBtn) closeModalBtn.addEventListener('click', closeModal);
  if (cancelModalBtn) cancelModalBtn.addEventListener('click', closeModal);
  if (expenseModal) {
    expenseModal.addEventListener('click', (e) => {
      if (e.target === expenseModal) closeModal();
    });
  }

  // Edit / Delete delegation
  if (expenseRowsContainer) {
    expenseRowsContainer.addEventListener('click', async (e) => {
      const editBtn = e.target.closest('.edit-btn');
      const deleteBtn = e.target.closest('.delete-btn');

      if (editBtn) {
        const id = editBtn.getAttribute('data-id');
        openModal(id);
      }

      if (deleteBtn) {
        const id = deleteBtn.getAttribute('data-id');
        const row = deleteBtn.closest('.expense-row');
        if (row) {
          row.style.opacity = '0';
          row.style.transform = 'scale(0.98)';
        }
        await deleteExpenseDoc(id);
        showToast('Expense removed from ledger');
      }
    });
  }

  // Form Submit (Add / Edit)
  if (expenseForm) {
    expenseForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const title = document.getElementById('inputTitle').value;
      const category = document.getElementById('inputCategory').value;
      const cadence = document.getElementById('inputCadence').value;
      const amount = parseFloat(document.getElementById('inputAmount').value);
      const dueDate = document.getElementById('inputDate').value || 'Pending';
      const paymentMethod = document.getElementById('inputMethod').value;

      const payload = {
        title,
        category,
        cadence,
        amount,
        dueDate,
        paymentMethod
      };

      if (editingExpenseId) {
        await updateExpenseDoc(editingExpenseId, payload);
        showToast(`Updated ${title}`);
      } else {
        await addExpenseDoc(payload);
        showToast(`Added ${title} to Firestore`);
      }

      closeModal();
    });
  }
}

// App Initialization Entrypoint
async function startApp() {
  console.log('Initializing Obsidian Expense Tracker...');
  await initAuth();

  setupEventListeners();

  subscribeToExpenses((items) => {
    allExpenses = items;
    updateUI();
  });
}

document.addEventListener('DOMContentLoaded', startApp);
