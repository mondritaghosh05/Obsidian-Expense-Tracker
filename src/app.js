import { initAuth } from './firebase.js';
import { 
  subscribeToExpenses, 
  addExpenseDoc, 
  updateExpenseDoc, 
  deleteExpenseDoc,
  toggleExpenseStatusDoc,
  clearAllExpenses,
  setActiveVault
} from './services/expenseService.js';
import { 
  getActiveCurrency, 
  setActiveCurrency, 
  setBaseCurrency,
  getFxTickerPairs,
  formatCurrency 
} from './services/fxService.js';

let allExpenses = [];
let currentFilter = 'all';
let selectedCategoryFilter = null;
let searchQuery = '';
let editingExpenseId = null;
let lastSavedId = null;

let targetMonthlyBudgetUsd = parseFloat(localStorage.getItem('obsidian_target_budget') || '15000');

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

const totalOutflowProgressBar = document.getElementById('totalOutflowProgressBar');
const budgetStatusTag = document.getElementById('budgetStatusTag');

const expenseRowsContainer = document.getElementById('expenseRowsContainer');
const displayedCount = document.getElementById('displayedCount');
const tableSearchInput = document.getElementById('tableSearchInput');
const headerSearchInput = document.getElementById('headerSearchInput');

const baseCurrencySelect = document.getElementById('baseCurrencySelect');
const fxTickerContainer = document.getElementById('fxTickerContainer');

const expenseModal = document.getElementById('expenseModal');
const openAddModalBtn = document.getElementById('openAddModalBtn');
const closeModalBtn = document.getElementById('closeModalBtn');
const cancelModalBtn = document.getElementById('cancelModalBtn');
const expenseForm = document.getElementById('expenseForm');
const modalHeading = document.getElementById('modalHeading');
const modalCurrencySymbol = document.getElementById('modalCurrencySymbol');

const exportCsvBtn = document.getElementById('exportCsvBtn');
const sidebarExportBtn = document.getElementById('sidebarExportBtn');
const resetLedgerBtn = document.getElementById('resetLedgerBtn');
const editBudgetBtn = document.getElementById('editBudgetBtn');

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

function updateFxTickerUI() {
  if (!fxTickerContainer) return;
  const pairs = getFxTickerPairs();

  fxTickerContainer.innerHTML = pairs.map(p => `
    <div class="flex items-center gap-1.5 px-space-sm py-1 rounded-lg bg-surface-container-lowest/60 text-on-surface hover:bg-surface-container-lowest transition-colors cursor-pointer">
      <span class="text-on-surface-variant font-medium">${p.name}</span>
      <span class="font-semibold text-primary">${p.value}</span>
      <span class="${p.positive ? 'text-secondary' : 'text-error'} flex items-center text-[11px] font-semibold">${p.change}</span>
    </div>
  `).join('');
}

function updateMetrics() {
  let regularUsdMonthly = 0;
  let monthlyUsdFixed = 0;
  let yearlyUsdAmortized = 0;

  allExpenses.forEach(exp => {
    const amt = parseFloat(exp.amount) || 0;
    if (exp.cadence === 'regular') {
      if ((exp.dueDate || '').toLowerCase().includes('daily')) {
        regularUsdMonthly += amt * 30;
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

  const pctSpent = Math.min(100, Math.round((totalMonthlyOutflowUsd / targetMonthlyBudgetUsd) * 100));
  if (totalOutflowProgressBar) {
    totalOutflowProgressBar.style.width = `${pctSpent}%`;
  }

  if (budgetStatusTag) {
    const deltaUsd = targetMonthlyBudgetUsd - totalMonthlyOutflowUsd;
    if (deltaUsd >= 0) {
      const pctUnder = Math.round((deltaUsd / targetMonthlyBudgetUsd) * 100);
      budgetStatusTag.className = 'inline-flex items-center text-secondary font-label-numeric-sm text-label-numeric-sm font-semibold';
      budgetStatusTag.innerHTML = `<span class="material-symbols-outlined text-[14px]">arrow_downward</span>${pctUnder}% under budget goal`;
    } else {
      const pctOver = Math.round((Math.abs(deltaUsd) / targetMonthlyBudgetUsd) * 100);
      budgetStatusTag.className = 'inline-flex items-center text-error font-label-numeric-sm text-label-numeric-sm font-semibold';
      budgetStatusTag.innerHTML = `<span class="material-symbols-outlined text-[14px]">arrow_upward</span>+${pctOver}% over budget ceiling`;
    }
  }
}

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

  const housingPct = grandTotal > 0 ? Math.round((categoryTotals.Housing / grandTotal) * 100) : 0;
  const softwarePct = grandTotal > 0 ? Math.round((categoryTotals.Software / grandTotal) * 100) : 0;
  const diningPct = grandTotal > 0 ? Math.round((categoryTotals.Dining / grandTotal) * 100) : 0;
  const transitPct = grandTotal > 0 ? Math.round((categoryTotals.Transit / grandTotal) * 100) : 0;
  const otherPct = grandTotal > 0 ? Math.max(0, 100 - (housingPct + softwarePct + diningPct + transitPct)) : 0;

  const housingEl = document.getElementById('pctHousing');
  const softwareEl = document.getElementById('pctSoftware');
  const diningEl = document.getElementById('pctDining');
  const transitEl = document.getElementById('pctTransit');

  if (housingEl) housingEl.textContent = `${housingPct}%`;
  if (softwareEl) softwareEl.textContent = `${softwarePct}%`;
  if (diningEl) diningEl.textContent = `${diningPct}%`;
  if (transitEl) transitEl.textContent = `${transitPct}%`;

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
      const strokeLen = grandTotal > 0 ? (item.pct / 100) * circ : 0;
      elem.setAttribute('stroke-dasharray', `${strokeLen.toFixed(1)} ${circ.toFixed(1)}`);
      elem.setAttribute('stroke-dashoffset', `-${offset.toFixed(1)}`);
      offset += strokeLen;
    }
  });
}

function updateVelocityGraph() {
  const cyanPath = document.getElementById('cyanGraphPath');
  const cyanArea = document.getElementById('cyanGraphArea');
  const emeraldPath = document.getElementById('emeraldGraphPath');
  const emeraldArea = document.getElementById('emeraldGraphArea');
  const graphStatus = document.getElementById('graphBudgetStatus');

  if (!cyanPath || !cyanArea) return;

  let monthlySumUsd = 0;
  allExpenses.forEach(exp => {
    const amt = parseFloat(exp.amount) || 0;
    if (exp.cadence === 'regular') monthlySumUsd += amt * 4.33;
    else if (exp.cadence === 'monthly') monthlySumUsd += amt;
    else if (exp.cadence === 'yearly') monthlySumUsd += amt / 12;
  });

  const maxScale = Math.max(20000, targetMonthlyBudgetUsd * 1.4);
  const normalizedOutflow = Math.min(180, (monthlySumUsd / maxScale) * 160);
  const normalizedTarget = Math.min(180, (targetMonthlyBudgetUsd / maxScale) * 160);

  const yActual = 180 - normalizedOutflow;
  const yTarget = 180 - normalizedTarget;

  const p0 = [0, yActual + 15];
  const p1 = [120, yActual - 10];
  const p2 = [240, yActual + 8];
  const p3 = [360, yActual - 15];
  const p4 = [480, yActual + 5];
  const p5 = [600, yActual - 20];
  const p6 = [700, yActual - 10];

  const t0 = [0, yTarget + 10];
  const t1 = [140, yTarget - 5];
  const t2 = [280, yTarget + 5];
  const t3 = [420, yTarget - 10];
  const t4 = [560, yTarget + 2];
  const t5 = [700, yTarget - 5];

  const dCyanPath = `M${p0[0]},${p0[1]} C${p1[0]},${p1[1]} ${p2[0]},${p2[1]} ${p3[0]},${p3[1]} C${p4[0]},${p4[1]} ${p5[0]},${p5[1]} ${p6[0]},${p6[1]}`;
  const dCyanArea = `${dCyanPath} L700,200 L0,200 Z`;

  const dEmeraldPath = `M${t0[0]},${t0[1]} C${t1[0]},${t1[1]} ${t2[0]},${t2[1]} ${t3[0]},${t3[1]} C${t4[0]},${t4[1]} ${t5[0]},${t5[1]}`;
  const dEmeraldArea = `${dEmeraldPath} L700,200 L0,200 Z`;

  cyanPath.setAttribute('d', dCyanPath);
  cyanArea.setAttribute('d', dCyanArea);

  if (emeraldPath) emeraldPath.setAttribute('d', dEmeraldPath);
  if (emeraldArea) emeraldArea.setAttribute('d', dEmeraldArea);

  if (graphStatus) {
    if (allExpenses.length === 0) {
      graphStatus.textContent = 'Vault Empty - Ready for expenses';
      graphStatus.className = 'font-label-numeric-sm text-label-numeric-sm text-on-surface-variant font-medium';
    } else {
      const delta = Math.round(((targetMonthlyBudgetUsd - monthlySumUsd) / targetMonthlyBudgetUsd) * 100);
      if (delta >= 0) {
        graphStatus.textContent = `${delta}% under annual burn target`;
        graphStatus.className = 'font-label-numeric-sm text-label-numeric-sm text-secondary font-medium';
      } else {
        graphStatus.textContent = `${Math.abs(delta)}% above burn ceiling`;
        graphStatus.className = 'font-label-numeric-sm text-label-numeric-sm text-error font-medium';
      }
    }
  }
}

function renderTable() {
  if (!expenseRowsContainer) return;

  const filtered = allExpenses.filter(exp => {
    const matchesTab = (currentFilter === 'all' || exp.cadence === currentFilter);
    const matchesCat = !selectedCategoryFilter || exp.category.toLowerCase().includes(selectedCategoryFilter.toLowerCase());
    
    const q = searchQuery.toLowerCase();
    const matchesSearch = !q || 
      (exp.title || '').toLowerCase().includes(q) || 
      (exp.category || '').toLowerCase().includes(q) || 
      (exp.paymentMethod || '').toLowerCase().includes(q);

    return matchesTab && matchesCat && matchesSearch;
  });

  if (displayedCount) displayedCount.textContent = filtered.length;

  if (filtered.length === 0) {
    const emptyMsg = allExpenses.length === 0 
      ? 'Your ledger is empty. Click "+ New Expense" to log your first expense entry!' 
      : 'No matching expense entries found in current view.';

    expenseRowsContainer.innerHTML = `
      <tr>
        <td colspan="9" class="py-12 text-center text-on-surface-variant font-body-md">
          <div class="flex flex-col items-center gap-3">
            <span class="material-symbols-outlined text-[36px] text-primary">post_add</span>
            <span class="text-on-surface font-semibold text-title-md">${emptyMsg}</span>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  expenseRowsContainer.innerHTML = filtered.map(exp => {
    const style = getCategoryStyle(exp.category);
    const activeAmt = formatCurrency(parseFloat(exp.amount) || 0);
    const baseUsd = '$' + (parseFloat(exp.amount) || 0).toFixed(2);
    const isAddressed = exp.status === 'addressed';
    
    let cadenceBadge = '';
    if (exp.cadence === 'regular') {
      cadenceBadge = '<span class="px-2 py-0.5 rounded-md font-label-caps text-label-caps font-semibold bg-secondary/15 text-secondary">Regular</span>';
    } else if (exp.cadence === 'monthly') {
      cadenceBadge = '<span class="px-2 py-0.5 rounded-md font-label-caps text-label-caps font-semibold bg-primary/20 text-primary">Monthly</span>';
    } else {
      cadenceBadge = '<span class="px-2 py-0.5 rounded-md font-label-caps text-label-caps font-semibold bg-tertiary-container/40 text-on-surface">Yearly</span>';
    }

    const isJustSaved = exp.id === lastSavedId;
    const highlightClasses = isJustSaved ? 'bg-primary-container/20 ring-1 ring-primary-container' : '';

    return `
      <tr class="expense-row group hover:bg-surface-container-high/30 transition-all duration-300 ${highlightClasses} ${isAddressed ? 'opacity-90' : ''}" data-id="${exp.id}">
        <td class="py-3.5 px-space-xs text-center">
          <button class="status-toggle-btn w-6 h-6 rounded-md border flex items-center justify-center transition-all ${isAddressed ? 'bg-secondary border-secondary text-surface-container-lowest' : 'border-outline-variant hover:border-primary text-transparent'}" data-id="${exp.id}" data-status="${exp.status || 'pending'}" title="${isAddressed ? 'Mark Pending' : 'Mark Addressed / Paid'}">
            <span class="material-symbols-outlined text-[14px] font-bold">check</span>
          </button>
        </td>

        <td class="py-3.5 px-space-md flex items-center gap-space-sm">
          <div class="w-7 h-7 rounded-lg bg-surface-container-highest flex items-center justify-center ${style.iconColor}">
            <span class="material-symbols-outlined text-[16px]">${style.icon}</span>
          </div>
          <div class="flex flex-col">
            <span class="font-title-md text-title-md ${isAddressed ? 'line-through text-on-surface-variant' : 'text-on-surface'} font-medium">${exp.title}</span>
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

  if (lastSavedId) {
    setTimeout(() => {
      const savedRow = document.querySelector(`.expense-row[data-id="${lastSavedId}"]`);
      if (savedRow) {
        savedRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 100);
  }
}

function updateUI() {
  updateFxTickerUI();
  updateMetrics();
  updateDonutChart();
  updateVelocityGraph();
  renderTable();
}

function exportToCSV() {
  if (allExpenses.length === 0) {
    showToast('No expenses available to export');
    return;
  }

  const headers = ['ID', 'Title', 'Category', 'Cadence', 'Amount_USD', 'Status', 'DueDate', 'PaymentMethod', 'Note'];
  const rows = allExpenses.map(e => [
    `"${e.id}"`,
    `"${e.title.replace(/"/g, '""')}"`,
    `"${e.category}"`,
    `"${e.cadence}"`,
    e.amount,
    `"${e.status || 'addressed'}"`,
    `"${e.dueDate || ''}"`,
    `"${e.paymentMethod || ''}"`,
    `"${(e.note || '').replace(/"/g, '""')}"`
  ]);

  const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  link.setAttribute('download', `obsidian_ledger_export_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  showToast('Exported ledger CSV to downloads');
}

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

function updateSidebarNavHighlight(activeNavTarget) {
  const sidebarLinks = document.querySelectorAll('[data-nav]');
  sidebarLinks.forEach(link => {
    const nav = link.getAttribute('data-nav');
    if (nav === activeNavTarget) {
      link.className = 'sidebar-nav-item flex items-center gap-space-sm px-space-md py-space-sm rounded-xl bg-primary-container text-on-primary-container font-semibold shadow-[0_0_16px_rgba(0,242,254,0.35)] transition-all font-body-md text-body-md w-full text-left';
    } else {
      link.className = 'sidebar-nav-item flex items-center gap-space-sm px-space-md py-space-sm rounded-xl text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-all font-body-md text-body-md w-full text-left';
    }
  });
}

function setupEventListeners() {
  if (baseCurrencySelect) {
    baseCurrencySelect.addEventListener('change', (e) => {
      const newBase = e.target.value;
      setBaseCurrency(newBase);
      setActiveCurrency(newBase);
      
      const currencyButtons = document.querySelectorAll('.currency-btn');
      currencyButtons.forEach(b => {
        if (b.getAttribute('data-currency') === newBase) {
          b.classList.add('bg-primary-container', 'text-on-primary-container');
          b.classList.remove('text-on-surface-variant');
        } else {
          b.classList.remove('bg-primary-container', 'text-on-primary-container');
          b.classList.add('text-on-surface-variant');
        }
      });

      updateUI();
      showToast(`Base & display currency set to ${newBase}`);
    });
  }

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
      showToast(`Display currency set to ${updatedCurr.code} (${updatedCurr.symbol})`);
    });
  });

  const sidebarNavItems = document.querySelectorAll('[data-nav]');
  sidebarNavItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const navTarget = item.getAttribute('data-nav');
      updateSidebarNavHighlight(navTarget);

      if (navTarget === 'overview') {
        currentFilter = 'all';
        selectedCategoryFilter = null;
        renderTable();
        window.scrollTo({ top: 0, behavior: 'smooth' });
        showToast('Viewing Overview & All Expenses');
      } else if (navTarget === 'regular' || navTarget === 'monthly' || navTarget === 'yearly') {
        currentFilter = navTarget;
        selectedCategoryFilter = null;
        
        const ledgerTabs = document.querySelectorAll('.ledger-tab');
        ledgerTabs.forEach(t => {
          if (t.getAttribute('data-filter') === navTarget) {
            t.classList.add('bg-surface-container-highest', 'text-on-surface', 'shadow-sm');
            t.classList.remove('text-on-surface-variant');
          } else {
            t.classList.remove('bg-surface-container-highest', 'text-on-surface', 'shadow-sm');
            t.classList.add('text-on-surface-variant');
          }
        });

        renderTable();
        const directoryTable = document.getElementById('expensesTable');
        if (directoryTable) directoryTable.scrollIntoView({ behavior: 'smooth', block: 'start' });
        showToast(`Filtered ledger by ${navTarget} expenses`);
      } else if (navTarget === 'fx') {
        window.scrollTo({ top: 0, behavior: 'smooth' });
        if (baseCurrencySelect) baseCurrencySelect.focus();
        showToast('Focused FX Currency Exchange Ticker');
      } else if (navTarget === 'export') {
        exportToCSV();
      }
    });
  });

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
      updateSidebarNavHighlight(currentFilter === 'all' ? 'overview' : currentFilter);
      renderTable();
    });
  });

  const categoryFilterRows = document.querySelectorAll('.cat-filter-btn');
  categoryFilterRows.forEach(btn => {
    btn.addEventListener('click', () => {
      const catTarget = btn.getAttribute('data-category');
      if (selectedCategoryFilter === catTarget) {
        selectedCategoryFilter = null;
        btn.classList.remove('bg-surface-container-high');
        showToast('Cleared category filter');
      } else {
        selectedCategoryFilter = catTarget;
        categoryFilterRows.forEach(b => b.classList.remove('bg-surface-container-high'));
        btn.classList.add('bg-surface-container-high');
        showToast(`Filtered by ${catTarget}`);
      }
      renderTable();
    });
  });

  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      if (headerSearchInput) {
        headerSearchInput.focus();
        headerSearchInput.select();
      } else if (tableSearchInput) {
        tableSearchInput.focus();
        tableSearchInput.select();
      }
    }
  });

  const handleSearch = (val) => {
    searchQuery = val || '';
    if (headerSearchInput && headerSearchInput.value !== val) headerSearchInput.value = val;
    if (tableSearchInput && tableSearchInput.value !== val) tableSearchInput.value = val;
    renderTable();
  };

  if (tableSearchInput) tableSearchInput.addEventListener('input', (e) => handleSearch(e.target.value));
  if (headerSearchInput) headerSearchInput.addEventListener('input', (e) => handleSearch(e.target.value));

  if (editBudgetBtn) {
    editBudgetBtn.addEventListener('click', () => {
      const inputVal = prompt('Enter your target monthly budget limit (in USD):', targetMonthlyBudgetUsd);
      if (inputVal && !isNaN(parseFloat(inputVal))) {
        targetMonthlyBudgetUsd = Math.max(100, parseFloat(inputVal));
        localStorage.setItem('obsidian_target_budget', targetMonthlyBudgetUsd.toString());
        updateUI();
        showToast(`Target monthly budget updated to $${targetMonthlyBudgetUsd.toLocaleString()}`);
      }
    });
  }

  if (exportCsvBtn) exportCsvBtn.addEventListener('click', exportToCSV);
  if (sidebarExportBtn) sidebarExportBtn.addEventListener('click', exportToCSV);

  if (resetLedgerBtn) {
    resetLedgerBtn.addEventListener('click', async () => {
      if (confirm('Clear all entries from active vault?')) {
        await clearAllExpenses();
        showToast('All vault expenses cleared');
      }
    });
  }

  const vaultSelector = document.getElementById('vaultSelector');
  if (vaultSelector) {
    vaultSelector.addEventListener('change', (e) => {
      const selectedVault = e.target.value;
      setActiveVault(selectedVault);
      subscribeToExpenses((items) => {
        allExpenses = items;
        updateUI();
      });
      showToast(`Switched active vault to ${e.target.options[e.target.selectedIndex].text}`);
    });
  }

  if (openAddModalBtn) openAddModalBtn.addEventListener('click', () => openModal());
  if (closeModalBtn) closeModalBtn.addEventListener('click', closeModal);
  if (cancelModalBtn) cancelModalBtn.addEventListener('click', closeModal);
  if (expenseModal) {
    expenseModal.addEventListener('click', (e) => {
      if (e.target === expenseModal) closeModal();
    });
  }

  if (expenseRowsContainer) {
    expenseRowsContainer.addEventListener('click', async (e) => {
      const editBtn = e.target.closest('.edit-btn');
      const deleteBtn = e.target.closest('.delete-btn');
      const statusBtn = e.target.closest('.status-toggle-btn');

      if (statusBtn) {
        const id = statusBtn.getAttribute('data-id');
        const currStatus = statusBtn.getAttribute('data-status');
        const newStatus = await toggleExpenseStatusDoc(id, currStatus);
        showToast(newStatus === 'addressed' ? 'Marked expense as Addressed / Paid' : 'Marked expense as Pending');
      }

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
        paymentMethod,
        status: 'addressed'
      };

      if (editingExpenseId) {
        await updateExpenseDoc(editingExpenseId, payload);
        lastSavedId = editingExpenseId;
        showToast(`Saved updates for ${title}`);
      } else {
        const newId = await addExpenseDoc(payload);
        lastSavedId = newId;
        showToast(`Recorded new expense: ${title}`);
      }

      if (currentFilter !== 'all' && currentFilter !== cadence) {
        currentFilter = 'all';
        const ledgerTabs = document.querySelectorAll('.ledger-tab');
        ledgerTabs.forEach(t => {
          if (t.getAttribute('data-filter') === 'all') {
            t.classList.add('bg-surface-container-highest', 'text-on-surface', 'shadow-sm');
          } else {
            t.classList.remove('bg-surface-container-highest', 'text-on-surface', 'shadow-sm');
          }
        });
      }

      selectedCategoryFilter = null;
      searchQuery = '';
      if (tableSearchInput) tableSearchInput.value = '';
      if (headerSearchInput) headerSearchInput.value = '';

      closeModal();
      renderTable();
    });
  }
}

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
