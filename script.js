const STORAGE_KEY = "expense-tracker-state-v1";

const generateId = () =>
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const state = {
  transactions: [],
  goals: [],
  settings: {
    theme: "dark",
    budgetLimit: 0,
  },
};

let showRecurringOnly = false;
let categoryChartInstance = null;
let monthlyChartInstance = null;
let deferredInstallPrompt = null;
let installBannerElement = null;

const elements = {
  balanceAmount: document.getElementById("balanceAmount"),
  incomeTotal: document.getElementById("incomeTotal"),
  expenseTotal: document.getElementById("expenseTotal"),
  transactionForm: document.getElementById("transactionForm"),
  transactionTableBody: document.getElementById("transactionTableBody"),
  recentTransactionsList: document.getElementById("recentTransactionsList"),
  goalForm: document.getElementById("goalForm"),
  goalsList: document.getElementById("goalsList"),
  budgetForm: document.getElementById("budgetForm"),
  budgetLimit: document.getElementById("budgetLimit"),
  budgetProgressBar: document.getElementById("budgetProgressBar"),
  budgetUsageLabel: document.getElementById("budgetUsageLabel"),
  budgetWarning: document.getElementById("budgetWarning"),
  clearAllBtn: document.getElementById("clearAllBtn"),
  recurringBtn: document.getElementById("recurringBtn"),
  themeToggle: document.getElementById("themeToggle"),
  toastContainer: document.getElementById("toastContainer"),
  exportDataBtn: document.getElementById("exportDataBtn"),
  importDataBtn: document.getElementById("importDataBtn"),
  importFileInput: document.getElementById("importFileInput"),
  mobileNavToggle: document.getElementById("mobileNavToggle"),
  navOverlay: document.getElementById("navOverlay"),
};

const formatCurrency = (value) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(value);

const loadState = () => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) {
      return;
    }
    const parsed = JSON.parse(saved);
    if (Array.isArray(parsed.transactions)) {
      state.transactions = parsed.transactions;
    }
    if (Array.isArray(parsed.goals)) {
      state.goals = parsed.goals;
    }
    if (parsed.settings) {
      state.settings = {
        ...state.settings,
        ...parsed.settings,
      };
    }
  } catch (error) {
    console.error("Failed to load state:", error);
    showToast("Unable to read saved data. Using defaults.", "error");
  }
};

const persistState = () => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
};

const bindEvents = () => {
  if (elements.transactionForm) {
    elements.transactionForm.addEventListener("submit", handleTransactionSubmit);
  }
  if (elements.goalForm) {
    elements.goalForm.addEventListener("submit", handleGoalSubmit);
  }
  if (elements.clearAllBtn) {
    elements.clearAllBtn.addEventListener("click", handleClearAll);
  }
  if (elements.recurringBtn) {
    elements.recurringBtn.addEventListener("click", handleToggleRecurring);
  }
  if (elements.themeToggle) {
    elements.themeToggle.addEventListener("click", toggleTheme);
  }
  if (elements.budgetForm) {
    elements.budgetForm.addEventListener("submit", handleBudgetSubmit);
  }
  if (elements.exportDataBtn) {
    elements.exportDataBtn.addEventListener("click", handleExport);
  }
  if (elements.importDataBtn && elements.importFileInput) {
    elements.importDataBtn.addEventListener("click", () => elements.importFileInput.click());
    elements.importFileInput.addEventListener("change", handleImport);
  }

  if (elements.mobileNavToggle) {
    elements.mobileNavToggle.addEventListener("click", toggleNavigation);
  }

  if (elements.navOverlay) {
    elements.navOverlay.addEventListener("click", closeNavigation);
  }

  document.querySelectorAll(".sidebar nav a").forEach((link) => {
    link.addEventListener("click", () => {
      if (isMobileViewport()) {
        closeNavigation();
      }
    });
  });

  window.addEventListener("resize", () => {
    if (!isMobileViewport()) {
      closeNavigation();
    }
  });
};

const handleTransactionSubmit = (event) => {
  event.preventDefault();
  const formData = new FormData(elements.transactionForm);
  const amount = Number(formData.get("amount"));
  if (Number.isNaN(amount) || amount <= 0) {
    showToast("Amount must be greater than 0.", "error");
    return;
  }

  const transaction = {
    id: generateId(),
    description: formData.get("description").trim(),
    amount,
    type: formData.get("type"),
    category: formData.get("category").trim() || "General",
    date: formData.get("date"),
    recurring: formData.get("recurring") === "on",
  };

  state.transactions.push(transaction);
  persistState();
  elements.transactionForm.reset();
  renderEverything();
  showToast("Transaction added!", "success");
};

const handleGoalSubmit = (event) => {
  event.preventDefault();
  const formData = new FormData(elements.goalForm);
  const target = Number(formData.get("target"));
  const current = Number(formData.get("current"));

  if (Number.isNaN(target) || target <= 0) {
    showToast("Goal target must be greater than 0.", "error");
    return;
  }

  if (Number.isNaN(current) || current < 0) {
    showToast("Goal current amount cannot be negative.", "error");
    return;
  }

  const goal = {
    id: generateId(),
    name: formData.get("name").trim(),
    target,
    current,
  };

  state.goals.push(goal);
  persistState();
  elements.goalForm.reset();
  renderGoals();
  showToast("Goal added.", "success");
};

const handleBudgetSubmit = (event) => {
  event.preventDefault();
  const limitValue = Number(elements.budgetLimit.value);
  if (Number.isNaN(limitValue) || limitValue < 0) {
    showToast("Budget must be 0 or greater.", "error");
    return;
  }
  state.settings.budgetLimit = limitValue;
  persistState();
  renderBudget();
  showToast("Budget updated.", "success");
};

const handleClearAll = () => {
  if (!state.transactions.length) {
    showToast("Nothing to clear.", "info");
    return;
  }
  const approval = confirm("Delete all transactions?");
  if (!approval) {
    return;
  }
  state.transactions = [];
  persistState();
  renderEverything();
  showToast("Transactions cleared.", "success");
};

const handleToggleRecurring = () => {
  showRecurringOnly = !showRecurringOnly;
  if (elements.recurringBtn) {
    elements.recurringBtn.textContent = showRecurringOnly ? "Show All" : "Recurring";
  }
  renderTransactions();
  showToast(showRecurringOnly ? "Showing recurring only." : "Showing all transactions.", "info");
};

const toggleTheme = () => {
  state.settings.theme = state.settings.theme === "dark" ? "light" : "dark";
  applyTheme();
  persistState();
  showToast(`Switched to ${state.settings.theme} mode.`, "info");
};

const applyTheme = () => {
  if (state.settings.theme === "light") {
    document.body.setAttribute("data-theme", "light");
  } else {
    document.body.removeAttribute("data-theme");
  }
};

const handleExport = () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "expense-tracker-data.json";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  showToast("Data exported.", "success");
};

const handleImport = (event) => {
  const [file] = event.target.files;
  if (!file) {
    return;
  }
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const parsed = JSON.parse(e.target.result);
      if (!parsed || typeof parsed !== "object") {
        throw new Error("Invalid data structure.");
      }
      state.transactions = Array.isArray(parsed.transactions) ? parsed.transactions : [];
      state.goals = Array.isArray(parsed.goals) ? parsed.goals : [];
      state.settings = {
        ...state.settings,
        ...(parsed.settings || {}),
      };
      persistState();
      renderEverything();
      showToast("Data imported successfully.", "success");
    } catch (error) {
      console.error("Import failed:", error);
      showToast("Failed to import data.", "error");
    } finally {
      if (elements.importFileInput) {
        elements.importFileInput.value = "";
      }
    }
  };
  reader.readAsText(file);
};

const showToast = (message, variant = "info", timeout = 3000) => {
  if (!elements.toastContainer) return;
  const toast = document.createElement("div");
  toast.className = `toast toast-${variant}`;
  toast.textContent = message;
  if (elements.toastContainer.children.length >= 4) {
    elements.toastContainer.firstChild.remove();
  }
  elements.toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.addEventListener(
      "transitionend",
      () => {
        toast.remove();
      },
      { once: true }
    );
    toast.style.opacity = "0";
    toast.style.transform = "translateY(10px)";
  }, timeout);
};

const renderEverything = () => {
  renderSummary();
  renderTransactions();
  renderGoals();
  renderBudget();
  updateCharts();
};

const renderSummary = () => {
  if (!elements.balanceAmount || !elements.incomeTotal || !elements.expenseTotal) {
    return;
  }
  const totals = state.transactions.reduce(
    (acc, transaction) => {
      if (transaction.type === "income") {
        acc.income += transaction.amount;
      } else if (transaction.type === "expense") {
        acc.expense += transaction.amount;
      }
      return acc;
    },
    { income: 0, expense: 0 }
  );
  const balance = totals.income - totals.expense;
  elements.balanceAmount.textContent = formatCurrency(balance);
  elements.incomeTotal.textContent = formatCurrency(totals.income);
  elements.expenseTotal.textContent = formatCurrency(totals.expense);
};

const renderTransactions = () => {
  const sorted = [...state.transactions].sort((a, b) => new Date(b.date) - new Date(a.date));

  if (elements.transactionTableBody) {
    const tbody = elements.transactionTableBody;
    tbody.innerHTML = "";

    let tableTransactions = [...sorted];
    if (showRecurringOnly) {
      tableTransactions = tableTransactions.filter((t) => t.recurring);
    }

    if (!tableTransactions.length) {
      const emptyRow = document.createElement("tr");
      emptyRow.className = "empty-row";
      emptyRow.innerHTML = `<td colspan="5">${showRecurringOnly ? "No recurring transactions." : "No transactions yet."}</td>`;
      tbody.appendChild(emptyRow);
    } else {
      const fragment = document.createDocumentFragment();
      tableTransactions.forEach((transaction) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${transaction.date ? formatDate(transaction.date) : "-"}</td>
          <td>
            <div>${transaction.description}</div>
            <small class="text-muted">${transaction.category}${transaction.recurring ? " • Recurring" : ""}</small>
          </td>
          <td>${capitalize(transaction.type)}</td>
          <td class="${transaction.type === "income" ? "amount-income" : "amount-expense"}">${formatCurrency(transaction.amount)}</td>
          <td><button class="delete-btn" aria-label="Delete transaction">✕</button></td>
        `;
        tr.querySelector(".delete-btn").addEventListener("click", () => {
          handleDeleteTransaction(transaction.id);
        });
        fragment.appendChild(tr);
      });
      tbody.appendChild(fragment);
    }
  }

  if (elements.recentTransactionsList) {
    const list = elements.recentTransactionsList;
    list.innerHTML = "";
    if (!sorted.length) {
      list.classList.add("empty-state");
      list.innerHTML = '<li class="text-muted">No transactions logged yet.</li>';
      return;
    }
    list.classList.remove("empty-state");
    sorted.slice(0, 5).forEach((transaction) => {
      const item = document.createElement("li");
      item.innerHTML = `
        <span>
          <strong>${transaction.description}</strong>
          <span class="${transaction.type === "income" ? "amount-income" : "amount-expense"}">${formatCurrency(transaction.amount)}</span>
        </span>
        <small>${formatDate(transaction.date)} • ${transaction.category}${transaction.recurring ? " • Recurring" : ""}</small>
      `;
      list.appendChild(item);
    });
  }
};

const handleDeleteTransaction = (id) => {
  state.transactions = state.transactions.filter((t) => t.id !== id);
  persistState();
  renderEverything();
  showToast("Transaction removed.", "info");
};

const renderGoals = () => {
  const container = elements.goalsList;
  if (!container) return;
  container.innerHTML = "";

  if (!state.goals.length) {
    container.classList.add("empty-state");
    container.innerHTML = "<p>No goals yet. Set your first target.</p>";
    return;
  }

  container.classList.remove("empty-state");

  const fragment = document.createDocumentFragment();

  state.goals.forEach((goal) => {
    const progressPercent = Math.min(Math.round((goal.current / goal.target) * 100), 100);
    const card = document.createElement("div");
    card.className = "goal-card";
    card.innerHTML = `
      <div>
        <strong>${goal.name}</strong>
        <div class="goal-meta">Target ${formatCurrency(goal.target)}</div>
      </div>
      <div class="goal-actions">
        <span class="goal-progress-label">${progressPercent}%</span>
        <button class="ghost-btn" data-action="edit">Edit</button>
        <button class="ghost-btn" data-action="delete">Delete</button>
      </div>
      <div class="goal-meta">Current ${formatCurrency(goal.current)}</div>
      <div class="progress-bar"><div style="width: 0"></div></div>
    `;
    const progressEl = card.querySelector(".progress-bar div");
    requestAnimationFrame(() => {
      progressEl.style.width = `${progressPercent}%`;
    });

    card.querySelector('[data-action="edit"]').addEventListener("click", () => handleEditGoal(goal.id));
    card.querySelector('[data-action="delete"]').addEventListener("click", () => handleDeleteGoal(goal.id));

    fragment.appendChild(card);
  });

  container.appendChild(fragment);
};

const handleEditGoal = (id) => {
  const goal = state.goals.find((item) => item.id === id);
  if (!goal) return;

  const newTarget = prompt("Update target amount", goal.target);
  if (newTarget === null) return;
  const parsedTarget = Number(newTarget);
  if (Number.isNaN(parsedTarget) || parsedTarget <= 0) {
    showToast("Invalid target amount.", "error");
    return;
  }

  const newCurrent = prompt("Update current amount", goal.current);
  if (newCurrent === null) return;
  const parsedCurrent = Number(newCurrent);
  if (Number.isNaN(parsedCurrent) || parsedCurrent < 0) {
    showToast("Invalid current amount.", "error");
    return;
  }

  goal.target = parsedTarget;
  goal.current = parsedCurrent;
  persistState();
  renderGoals();
  showToast("Goal updated.", "success");
};

const handleDeleteGoal = (id) => {
  state.goals = state.goals.filter((goal) => goal.id !== id);
  persistState();
  renderGoals();
  showToast("Goal removed.", "info");
};

const renderBudget = () => {
  if (!elements.budgetForm || !elements.budgetLimit || !elements.budgetProgressBar || !elements.budgetUsageLabel || !elements.budgetWarning) {
    return;
  }
  const limit = Number(state.settings.budgetLimit) || 0;
  if (limit) {
    elements.budgetLimit.value = limit;
  } else {
    elements.budgetLimit.value = "";
  }
  const currentMonth = new Date();
  const spent = state.transactions
    .filter((transaction) => transaction.type === "expense" && isSameMonth(transaction.date, currentMonth))
    .reduce((total, transaction) => total + transaction.amount, 0);

  elements.budgetUsageLabel.textContent = `${formatCurrency(spent)} / ${limit ? formatCurrency(limit) : "-"}`;

  let percentage = limit ? Math.min((spent / limit) * 100, 100) : 0;
  elements.budgetProgressBar.style.width = `${percentage}%`;
  elements.budgetProgressBar.style.background = spent > limit ? "linear-gradient(90deg, #e35757, rgba(227, 87, 87, 0.6))" : "";
  elements.budgetWarning.textContent =
    limit && spent > limit ? "Budget exceeded — audit expenses." : limit ? "" : "Set a budget to start tracking.";
};

const updateCharts = () => {
  renderCategoryChart();
  renderMonthlyChart();
};

const renderCategoryChart = () => {
  const canvas = document.getElementById("categoryChart");
  if (!canvas) return;

  const expensesByCategory = state.transactions
    .filter((t) => t.type === "expense")
    .reduce((acc, transaction) => {
      const key = transaction.category || "Other";
      acc[key] = (acc[key] || 0) + transaction.amount;
      return acc;
    }, {});

  let labels = Object.keys(expensesByCategory);
  let data = Object.values(expensesByCategory);

  if (!labels.length) {
    labels = ["No data"];
    data = [1];
  }

  const colors = labels.map((label, index) => {
    const baseColors = ["#4c9ee3", "#5fd68a", "#e35757", "#f8d06c", "#7f73ff", "#ff8f6b"];
    return baseColors[index % baseColors.length];
  });

  if (categoryChartInstance) {
    categoryChartInstance.destroy();
  }

  categoryChartInstance = new Chart(canvas, {
    type: "doughnut",
    data: {
      labels,
      datasets: [
        {
          data,
          backgroundColor: colors,
          borderWidth: 0,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: "bottom",
          labels: {
            color: getComputedStyle(document.body).getPropertyValue("--text-muted"),
            font: { family: "Inter", size: 12 },
          },
        },
      },
    },
  });
};

const renderMonthlyChart = () => {
  const canvas = document.getElementById("monthlyChart");
  if (!canvas) return;

  const months = getPastMonths(6);

  const incomeSeries = months.map((month) => sumByMonth(month, "income"));
  const expenseSeries = months.map((month) => sumByMonth(month, "expense"));

  if (monthlyChartInstance) {
    monthlyChartInstance.destroy();
  }

  monthlyChartInstance = new Chart(canvas, {
    type: "bar",
    data: {
      labels: months.map((key) => formatMonthKey(key)),
      datasets: [
        {
          label: "Income",
          data: incomeSeries,
          backgroundColor: "rgba(95, 214, 138, 0.7)",
          borderRadius: 6,
          maxBarThickness: 24,
        },
        {
          label: "Expense",
          data: expenseSeries,
          backgroundColor: "rgba(227, 87, 87, 0.7)",
          borderRadius: 6,
          maxBarThickness: 24,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: {
            color: getComputedStyle(document.body).getPropertyValue("--text-muted"),
            font: { family: "Inter", size: 12 },
          },
        },
      },
      scales: {
        x: {
          stacked: false,
          ticks: {
            color: getComputedStyle(document.body).getPropertyValue("--text-muted"),
          },
          grid: {
            color: "rgba(255, 255, 255, 0.05)",
          },
        },
        y: {
          beginAtZero: true,
          ticks: {
            color: getComputedStyle(document.body).getPropertyValue("--text-muted"),
            callback: (value) => formatCurrency(value),
          },
          grid: {
            color: "rgba(255, 255, 255, 0.05)",
          },
        },
      },
    },
  });
};

const getPastMonths = (count) => {
  const months = [];
  const current = new Date();
  for (let i = count - 1; i >= 0; i -= 1) {
    const date = new Date(current.getFullYear(), current.getMonth() - i, 1);
    months.push(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`);
  }
  return months;
};

const sumByMonth = (monthKey, type) =>
  state.transactions
    .filter((transaction) => transaction.type === type && transaction.date && transaction.date.startsWith(monthKey))
    .reduce((acc, transaction) => acc + transaction.amount, 0);

const formatDate = (value) => {
  if (!value) {
    return "-";
  }
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
};

const capitalize = (value) => value.charAt(0).toUpperCase() + value.slice(1);

const isSameMonth = (dateValue, reference) => {
  if (!dateValue) return false;
  const date = new Date(dateValue);
  return date.getMonth() === reference.getMonth() && date.getFullYear() === reference.getFullYear();
};

const formatMonthKey = (key) => {
  const [year, month] = key.split("-");
  return new Date(Number(year), Number(month) - 1).toLocaleDateString("en-US", {
    month: "short",
  });
};

const isMobileViewport = () => window.matchMedia("(max-width: 900px)").matches;

const openNavigation = () => {
  if (!elements.mobileNavToggle || !elements.navOverlay) return;
  document.body.classList.add("nav-open");
  elements.mobileNavToggle.setAttribute("aria-expanded", "true");
  elements.navOverlay.classList.remove("hidden");
};

const closeNavigation = () => {
  if (!elements.mobileNavToggle || !elements.navOverlay) return;
  document.body.classList.remove("nav-open");
  elements.mobileNavToggle.setAttribute("aria-expanded", "false");
  elements.navOverlay.classList.add("hidden");
};

const toggleNavigation = () => {
  if (!elements.mobileNavToggle || !elements.navOverlay) return;
  if (document.body.classList.contains("nav-open")) {
    closeNavigation();
  } else {
    openNavigation();
  }
};

const registerServiceWorker = () => {
  if (!("serviceWorker" in navigator)) {
    return;
  }
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("./service-worker.js")
      .then(() => {
        console.info("Service worker registered — offline support ready.");
      })
      .catch((error) => {
        console.error("Service worker registration failed:", error);
      });
  });
};

const hideInstallBanner = () => {
  if (installBannerElement) {
    installBannerElement.classList.add("hidden");
  }
};

const handleInstallClick = async () => {
  if (!deferredInstallPrompt) {
    hideInstallBanner();
    return;
  }
  installBannerElement?.classList.add("hidden");
  deferredInstallPrompt.prompt();
  const choice = await deferredInstallPrompt.userChoice;
  console.info(`PWA install outcome: ${choice.outcome}`);
  deferredInstallPrompt = null;
};

const ensureInstallBanner = () => {
  if (installBannerElement) {
    return installBannerElement;
  }
  const banner = document.createElement("div");
  banner.className = "install-banner hidden";
  banner.innerHTML = `
    <span class="banner-message">Install Expense Tracker for offline access.</span>
    <div class="banner-actions">
      <button class="primary-btn banner-install-btn" type="button">Install</button>
      <button class="banner-dismiss" type="button">Later</button>
    </div>
  `;
  document.body.appendChild(banner);
  banner.querySelector(".banner-install-btn").addEventListener("click", handleInstallClick);
  banner.querySelector(".banner-dismiss").addEventListener("click", hideInstallBanner);
  installBannerElement = banner;
  return banner;
};

const setupInstallPromptHandlers = () => {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    console.info("Expense Tracker PWA ready to install.");
    const banner = ensureInstallBanner();
    banner.classList.remove("hidden");
    showToast("Expense Tracker is ready to install.", "info", 4000);
  });

  window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null;
    hideInstallBanner();
    showToast("Expense Tracker installed! Accessible from your home screen.", "success", 4000);
  });
};

const init = () => {
  loadState();
  applyTheme();
  bindEvents();
  closeNavigation();
  renderEverything();
  registerServiceWorker();
  setupInstallPromptHandlers();
};

document.addEventListener("DOMContentLoaded", init);
