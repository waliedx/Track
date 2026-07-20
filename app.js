// ============================================================
// Track — Task & Routine Tracker Application
// Main Application Logic
// ============================================================

(function () {
  'use strict';

  // ── Supabase Configuration ────────────────────────────────
  const SUPABASE_URL = 'https://ahjesnhpbyeldigamuwj.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_qu5L4_xvKUdaQXkAEH8lbA_FS-8T2w5';
  const supabase = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY) : null;
  let currentUser = null;

  // ── Constants ──────────────────────────────────────────────
  const STORAGE_KEY = 'track_app_data';
  const CATEGORIES = {
    work: { label: 'Work', color: '#4f8cff', icon: '💼' },
    play: { label: 'Play', color: '#ff6b8a', icon: '🎮' },
    health: { label: 'Health', color: '#34d399', icon: '💪' },
    learning: { label: 'Learning', color: '#fbbf24', icon: '📚' }
  };

  const METRIC_PRESETS = [
    { name: 'Steps', unit: 'steps', icon: '👟' },
    { name: 'Distance', unit: 'km', icon: '🏃' },
    { name: 'Weight Lifted', unit: 'kg', icon: '🏋️' },
    { name: 'Reps', unit: 'reps', icon: '💪' },
    { name: 'Duration', unit: 'min', icon: '⏱️' },
    { name: 'Calories', unit: 'kcal', icon: '🔥' },
    { name: 'Pages Read', unit: 'pages', icon: '📖' },
    { name: 'Sets', unit: 'sets', icon: '🔄' },
    { name: 'Custom', unit: '', icon: '📏' }
  ];

  const MOTIVATIONAL_MESSAGES = [
    "You're on fire! 🔥", "Consistency is key! 🗝️", "Keep pushing! 💪",
    "Small steps, big results! 🚀", "You're building something great! ⭐",
    "Discipline = Freedom! 🏆", "Today counts! 📈", "Legend in the making! 👑"
  ];

  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  // ── State ──────────────────────────────────────────────────
  let state = {
    tasks: [],
    routines: [],
    logs: [],
    activeTab: 'dashboard',
    editingTask: null,
    editingRoutine: null
  };

  // ── Utility Helpers ────────────────────────────────────────
  function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 6);
  }

  function today() {
    return new Date().toISOString().split('T')[0];
  }

  function formatDate(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
  }

  function formatDateFull(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    return `${DAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
  }

  function daysAgo(n) {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d.toISOString().split('T')[0];
  }

  function daysBetween(date1, date2) {
    const d1 = new Date(date1 + 'T00:00:00');
    const d2 = new Date(date2 + 'T00:00:00');
    return Math.round((d2 - d1) / (1000 * 60 * 60 * 24));
  }

  function getTimeOfDayIcon(tod) {
    return tod === 'morning' ? '🌅' : tod === 'afternoon' ? '☀️' : '🌙';
  }

  function clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
  }

  async function saveState() {
    try {
      const data = {
        tasks: state.tasks,
        routines: state.routines,
        logs: state.logs
      };
      // Keep local storage in sync as a fallback
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));

      if (supabase && currentUser) {
        // Run in background without awaiting so UI isn't blocked
        supabase.from('user_data').upsert({ id: currentUser.id, state: data }).then(({ error }) => {
          if (error) console.error('Supabase save error:', error);
        });
      }
    } catch (e) {
      console.warn('Failed to save state:', e);
    }
  }

  function loadState() {
    try {
      // First load from local storage to show something immediately
      const data = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (data) {
        state.tasks = data.tasks || [];
        state.routines = data.routines || [];
        state.logs = data.logs || [];
      } else {
        state.tasks = [];
        state.routines = [];
        state.logs = [];
      }
    } catch (e) {
      console.warn('Failed to load state locally:', e);
    }
  }

  async function syncFromCloud() {
    if (!supabase || !currentUser) return;
    try {
      const { data, error } = await supabase.from('user_data').select('state').eq('id', currentUser.id).single();
      if (error && error.code !== 'PGRST116') { // PGRST116 is "No rows found"
        console.error('Supabase fetch error:', error);
        return;
      }
      if (data && data.state) {
        state.tasks = data.state.tasks || [];
        state.routines = data.state.routines || [];
        state.logs = data.state.logs || [];
        // Save to local storage for future fast loads
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data.state));
        renderActiveView();
        updateTopBar();
      }
    } catch (e) {
      console.warn('Failed to sync from cloud:', e);
    }
  }

  // ── Data Queries ──────────────────────────────────────────
  function getTask(id) {
    return state.tasks.find(h => h.id === id);
  }

  function getTodayLogs() {
    const t = today();
    return state.logs.filter(l => l.date === t);
  }

  function getLogsForTask(taskId, days = 30) {
    const start = daysAgo(days);
    return state.logs.filter(l => l.taskId === taskId && l.date >= start).sort((a, b) => a.date.localeCompare(b.date));
  }

  function getLogsForDate(date) {
    return state.logs.filter(l => l.date === date);
  }

  function isTaskCompletedToday(taskId) {
    return getTodayLogs().some(l => l.taskId === taskId && l.completed);
  }

  function calculateStreak(taskId) {
    let streak = 0;
    let checkDate = today();
    // If not completed today, start checking from yesterday
    if (!isTaskCompletedToday(taskId)) {
      checkDate = daysAgo(1);
    }
    while (true) {
      const hasLog = state.logs.some(l => l.taskId === taskId && l.date === checkDate && l.completed);
      if (!hasLog) break;
      streak++;
      const d = new Date(checkDate + 'T00:00:00');
      d.setDate(d.getDate() - 1);
      checkDate = d.toISOString().split('T')[0];
    }
    return streak;
  }

  function calculateBestStreak(taskId) {
    const logs = state.logs.filter(l => l.taskId === taskId && l.completed)
      .map(l => l.date).sort();
    if (logs.length === 0) return 0;
    let best = 1, current = 1;
    for (let i = 1; i < logs.length; i++) {
      if (daysBetween(logs[i - 1], logs[i]) === 1) {
        current++;
        best = Math.max(best, current);
      } else if (logs[i] !== logs[i-1]) {
        current = 1;
      }
    }
    return best;
  }

  function getCompletionRate(taskId, days = 30) {
    const start = daysAgo(days);
    const logs = state.logs.filter(l => l.taskId === taskId && l.date >= start && l.completed);
    return Math.round((logs.length / days) * 100);
  }

  function getTodayProgress() {
    const dailyTasks = state.tasks.filter(h => !h.archived);
    if (dailyTasks.length === 0) return 0;
    const completed = dailyTasks.filter(h => isTaskCompletedToday(h.id)).length;
    return Math.round((completed / dailyTasks.length) * 100);
  }

  function getWorkPlayBalance() {
    const logs30 = state.logs.filter(l => l.date >= daysAgo(30) && l.completed);
    const work = logs30.filter(l => {
      const h = getTask(l.taskId);
      return h && h.category === 'work';
    }).length;
    const play = logs30.filter(l => {
      const h = getTask(l.taskId);
      return h && h.category === 'play';
    }).length;
    const total = work + play;
    return total === 0 ? 50 : Math.round((work / total) * 100);
  }

  function getMetricTotal(metricName, days = 7) {
    const start = daysAgo(days);
    let total = 0;
    state.logs.filter(l => l.date >= start && l.metricValues).forEach(l => {
      const task = getTask(l.taskId);
      if (!task) return;
      (l.metricValues || []).forEach(mv => {
        const metric = (task.metrics || []).find(m => m.id === mv.metricId);
        if (metric && metric.name === metricName) {
          total += mv.value || 0;
        }
      });
    });
    return total;
  }

  function getPersonalRecord(taskId, metricId) {
    let best = { value: 0, date: null };
    state.logs.filter(l => l.taskId === taskId && l.metricValues).forEach(l => {
      (l.metricValues || []).forEach(mv => {
        if (mv.metricId === metricId && mv.value > best.value) {
          best = { value: mv.value, date: l.date };
        }
      });
    });
    return best;
  }

  function getMetricHistory(taskId, metricId, days = 30) {
    const start = daysAgo(days);
    const result = [];
    state.logs.filter(l => l.taskId === taskId && l.date >= start && l.metricValues)
      .sort((a, b) => a.date.localeCompare(b.date))
      .forEach(l => {
        const mv = (l.metricValues || []).find(m => m.metricId === metricId);
        if (mv) {
          result.push({ label: formatDate(l.date), value: mv.value, date: l.date });
        }
      });
    return result;
  }

  function getTargetHitRate(taskId, metricId, days = 30) {
    const task = getTask(taskId);
    if (!task) return 0;
    const metric = (task.metrics || []).find(m => m.id === metricId);
    if (!metric || !metric.target) return 0;
    const start = daysAgo(days);
    let hits = 0, total = 0;
    state.logs.filter(l => l.taskId === taskId && l.date >= start && l.metricValues).forEach(l => {
      const mv = (l.metricValues || []).find(m => m.metricId === metricId);
      if (mv) {
        total++;
        if (mv.value >= metric.target) hits++;
      }
    });
    return total === 0 ? 0 : Math.round((hits / total) * 100);
  }

  // ── Rendering Helpers ─────────────────────────────────────
  function $(selector) {
    return document.querySelector(selector);
  }

  function $$(selector) {
    return document.querySelectorAll(selector);
  }

  function el(tag, attrs = {}, children = []) {
    const element = document.createElement(tag);
    Object.entries(attrs).forEach(([key, val]) => {
      if (key === 'className') element.className = val;
      else if (key === 'innerHTML') element.innerHTML = val;
      else if (key === 'textContent') element.textContent = val;
      else if (key.startsWith('on')) element.addEventListener(key.slice(2).toLowerCase(), val);
      else if (key === 'style' && typeof val === 'object') {
        Object.assign(element.style, val);
      }
      else element.setAttribute(key, val);
    });
    children.forEach(child => {
      if (typeof child === 'string') element.appendChild(document.createTextNode(child));
      else if (child) element.appendChild(child);
    });
    return element;
  }

  function showToast(message, type = 'success') {
    const existing = $('.toast');
    if (existing) existing.remove();
    const toast = el('div', { className: `toast toast-${type}`, textContent: message });
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('active'));
    setTimeout(() => {
      toast.classList.remove('active');
      setTimeout(() => toast.remove(), 300);
    }, 2500);
  }

  function renderStars(rating, interactive = false, onChange = null) {
    const container = el('div', { className: 'rating' });
    for (let i = 1; i <= 5; i++) {
      const star = el('span', {
        className: `star ${i <= rating ? 'filled' : ''}`,
        textContent: i <= rating ? '★' : '☆',
      });
      if (interactive) {
        star.addEventListener('click', () => onChange && onChange(i));
        star.style.cursor = 'pointer';
      }
      container.appendChild(star);
    }
    return container;
  }

  function categoryDot(category) {
    return el('span', {
      className: 'category-dot',
      style: { background: CATEGORIES[category]?.color || '#888' }
    });
  }

  // ── Tab Navigation ────────────────────────────────────────
  function initNavigation() {
    const navItems = $$('.nav-item');
    navItems.forEach(item => {
      item.addEventListener('click', () => {
        const tab = item.dataset.tab;
        switchTab(tab);
      });
    });
  }

  function switchTab(tab) {
    state.activeTab = tab;
    // Update nav
    $$('.nav-item').forEach(item => {
      item.classList.toggle('active', item.dataset.tab === tab);
    });
    // Update views
    $$('.tab-view').forEach(view => {
      view.classList.toggle('active', view.id === `view-${tab}`);
    });
    // Render the active view
    renderActiveView();
  }

  function renderActiveView() {
    switch (state.activeTab) {
      case 'dashboard': renderDashboard(); break;
      case 'tasks': renderTasks(); break;
      case 'log': renderLog(); break;
      case 'progress': renderProgress(); break;
      case 'settings': renderSettings(); break;
    }
  }

  // ── Settings View ─────────────────────────────────────────────
  function renderSettings() {
    const container = $('#view-settings');
    container.innerHTML = `
      <div class="view-header">
        <h1>Settings</h1>
        <p class="text-muted">Manage your app data and preferences</p>
      </div>
      <div class="card">
        <h3>Data Management</h3>
        <p class="text-muted mb-md">Export your data for backup or import from an existing backup.</p>
        <button class="btn btn-primary mb-sm w-100" id="settings-export-btn">Export Data</button>
        <button class="btn btn-secondary w-100" id="settings-import-btn">Import Data</button>
      </div>
      <div class="card mt-md">
        <h3>Quick Log</h3>
        <p class="text-muted mb-md">Quickly log progress for your active tasks.</p>
        <button class="btn btn-primary w-100" id="settings-quick-log-btn">Open Quick Log</button>
      </div>
      <div class="card mt-md" style="border: 1px solid var(--color-danger-bg);">
        <h3>Account</h3>
        <p class="text-muted mb-md">Log out of your account to clear your local data.</p>
        <button class="btn btn-secondary w-100" style="color: var(--color-danger);" id="settings-logout-btn">Log Out</button>
      </div>
    `;

    $('#settings-export-btn').addEventListener('click', exportData);
    $('#settings-import-btn').addEventListener('click', () => $('#import-file').click());
    $('#settings-quick-log-btn').addEventListener('click', () => {
      if (state.tasks.length > 0) {
        openQuickLogPicker();
      } else {
        showToast('No active tasks to log');
      }
    });
    $('#settings-logout-btn').addEventListener('click', async () => {
      if (supabase) await supabase.auth.signOut();
    });
  }

  // ── Dashboard View ────────────────────────────────────────
  function renderDashboard() {
    const container = $('#view-dashboard');
    const progress = getTodayProgress();
    const todayLogs = getTodayLogs();
    const activeTasks = state.tasks.filter(h => !h.archived);
    const streak = getMaxStreak();
    const balance = getWorkPlayBalance();

    container.innerHTML = `
      <div class="dashboard-header">
        <div class="greeting">
          <h1>${getGreeting()}</h1>
          <p class="text-muted">${formatDateFull(today())}</p>
        </div>
      </div>

      <div class="dashboard-grid">
        <div class="card progress-card">
          <div id="progress-ring-container"></div>
        </div>

        <div class="card stat-card">
          <span class="stat-icon">🔥</span>
          <span class="stat-value">${streak}</span>
          <span class="stat-label">Best Active Streak</span>
        </div>

        <div class="card stat-card">
          <span class="stat-icon">✅</span>
          <span class="stat-value">${todayLogs.filter(l => l.completed).length}/${activeTasks.length}</span>
          <span class="stat-label">Done Today</span>
        </div>

        <div class="card stat-card">
          <span class="stat-icon">📊</span>
          <span class="stat-value">${getCompletionRateAll()}%</span>
          <span class="stat-label">30-Day Rate</span>
        </div>
      </div>

      ${renderMetricSnapshots()}

      <div class="card balance-card">
        <h3>Work / Play Balance</h3>
        <div class="balance-meter">
          <div class="balance-fill" style="width: ${balance}%"></div>
        </div>
        <div class="balance-labels">
          <span style="color: #4f8cff">💼 Work ${balance}%</span>
          <span style="color: #ff6b8a">🎮 Play ${100 - balance}%</span>
        </div>
      </div>

      <div class="section-header">
        <h2>Today's Tasks</h2>
      </div>

      <div class="tasks-today-list" id="tasks-today">
        ${activeTasks.length === 0 ? renderEmptyState('No tasks yet', 'Add your first task to get started!', 'Add Task') : ''}
      </div>

      <div class="card heatmap-card">
        <h3>Activity Heatmap</h3>
        <div id="heatmap-container"></div>
      </div>

      ${streak >= 7 ? `<div class="motivation-banner card">${MOTIVATIONAL_MESSAGES[Math.floor(Math.random() * MOTIVATIONAL_MESSAGES.length)]}</div>` : ''}
    `;

    // Render progress ring
    if (window.Charts) {
      const ringContainer = $('#progress-ring-container');
      if (ringContainer) {
        Charts.progressRing(ringContainer, progress, {
          size: 130,
          strokeWidth: 10,
          color: progress === 100 ? '#34d399' : '#4f8cff',
          label: 'completed',
          sublabel: 'today',
          animated: true
        });
      }
    }

    // Render today's tasks
    renderTodayTasks();

    // Render heatmap
    renderHeatmap();
  }

  function getGreeting() {
    const h = new Date().getHours();
    if (h < 12) return 'Good Morning';
    if (h < 17) return 'Good Afternoon';
    return 'Good Evening';
  }

  function getMaxStreak() {
    const activeTasks = state.tasks.filter(h => !h.archived);
    if (activeTasks.length === 0) return 0;
    return Math.max(...activeTasks.map(h => calculateStreak(h.id)), 0);
  }

  function getCompletionRateAll() {
    const activeTasks = state.tasks.filter(h => !h.archived);
    if (activeTasks.length === 0) return 0;
    const rates = activeTasks.map(h => getCompletionRate(h.id, 30));
    return Math.round(rates.reduce((a, b) => a + b, 0) / rates.length);
  }

  function renderMetricSnapshots() {
    const metricsUsed = new Map();
    state.tasks.filter(h => !h.archived && h.metrics && h.metrics.length > 0).forEach(h => {
      h.metrics.forEach(m => {
        if (!metricsUsed.has(m.name)) {
          metricsUsed.set(m.name, { icon: m.icon, unit: m.unit, target: m.target || 0 });
        }
      });
    });

    if (metricsUsed.size === 0) return '';

    let html = '<div class="metric-snapshots">';
    metricsUsed.forEach((info, name) => {
      const todayTotal = getMetricTotalToday(name);
      const pct = info.target > 0 ? Math.min(100, Math.round((todayTotal / info.target) * 100)) : 0;
      const isHit = info.target > 0 && todayTotal >= info.target;
      html += `
        <div class="card metric-snapshot-card ${isHit ? 'target-hit' : ''}">
          <div class="metric-snap-header">
            <span class="metric-snap-icon">${info.icon}</span>
            <span class="metric-snap-name">${name}</span>
          </div>
          <div class="metric-snap-value">${formatNumber(todayTotal)} <small>${info.unit}</small></div>
          ${info.target > 0 ? `<div class="metric-mini-bar-container" id="metric-snap-${name.replace(/\s/g, '-')}"></div>
          <div class="metric-snap-target">${isHit ? '🎯 Target hit!' : `Target: ${formatNumber(info.target)} ${info.unit}`}</div>` : ''}
        </div>
      `;
    });
    html += '</div>';

    // Schedule mini bar rendering
    setTimeout(() => {
      metricsUsed.forEach((info, name) => {
        if (info.target > 0 && window.Charts) {
          const container = $(`#metric-snap-${name.replace(/\s/g, '-')}`);
          if (container) {
            const todayTotal = getMetricTotalToday(name);
            Charts.miniBar(container, todayTotal, info.target, {
              color: todayTotal >= info.target ? '#34d399' : '#4f8cff',
              animated: true
            });
          }
        }
      });
    }, 100);

    return html;
  }

  function getMetricTotalToday(metricName) {
    let total = 0;
    const t = today();
    state.logs.filter(l => l.date === t && l.metricValues).forEach(l => {
      const task = getTask(l.taskId);
      if (!task) return;
      (l.metricValues || []).forEach(mv => {
        const metric = (task.metrics || []).find(m => m.id === mv.metricId);
        if (metric && metric.name === metricName) {
          total += mv.value || 0;
        }
      });
    });
    return total;
  }

  function formatNumber(n) {
    if (n >= 10000) return (n / 1000).toFixed(1) + 'k';
    if (n >= 1000) return n.toLocaleString();
    if (Number.isInteger(n)) return n.toString();
    return n.toFixed(1);
  }

  function renderTodayTasks() {
    const container = $('#tasks-today');
    if (!container) return;
    const activeTasks = state.tasks.filter(h => !h.archived);
    if (activeTasks.length === 0) return;

    container.innerHTML = '';
    activeTasks.forEach(task => {
      const completed = isTaskCompletedToday(task.id);
      const streak = calculateStreak(task.id);
      const item = el('div', { className: `task-item ${completed ? 'completed' : ''}` }, [
        el('button', {
          className: `task-check ${completed ? 'checked' : ''}`,
          style: { '--cat-color': CATEGORIES[task.category]?.color },
          onClick: () => toggleTaskCompletion(task.id)
        }, [
          el('span', { className: 'check-icon', innerHTML: completed ? '✓' : '' })
        ]),
        el('div', { className: 'task-item-info' }, [
          el('div', { className: 'task-item-top' }, [
            el('span', { className: 'task-item-name', textContent: task.name }),
            categoryDot(task.category),
          ]),
          el('div', { className: 'task-item-meta' }, [
            streak > 0 ? el('span', { className: `streak-badge ${streak >= 7 ? 'hot' : ''}`, innerHTML: `🔥 ${streak}` }) : null,
            ...(task.metrics || []).map(m => {
              const todayLog = getTodayLogs().find(l => l.taskId === task.id && l.metricValues);
              const mv = todayLog ? (todayLog.metricValues || []).find(v => v.metricId === m.id) : null;
              return el('span', { className: 'metric-badge', textContent: `${m.icon} ${mv ? formatNumber(mv.value) : '—'} ${m.unit}` });
            })
          ].filter(Boolean))
        ]),
        el('button', {
          className: 'task-item-log-btn',
          textContent: '📝',
          title: 'Log details',
          onClick: (e) => { e.stopPropagation(); openLogModal(task.id); }
        })
      ]);
      container.appendChild(item);
    });
  }

  function renderHeatmap() {
    const container = $('#heatmap-container');
    if (!container || !window.Charts) return;
    const data = {};
    for (let i = 0; i < 84; i++) { // 12 weeks
      const date = daysAgo(83 - i);
      const logs = getLogsForDate(date).filter(l => l.completed);
      const totalTasks = state.tasks.filter(h => !h.archived).length || 1;
      const ratio = logs.length / totalTasks;
      data[date] = ratio >= 1 ? 4 : ratio >= 0.75 ? 3 : ratio >= 0.5 ? 2 : ratio > 0 ? 1 : 0;
    }
    Charts.heatmap(container, data, { color: '#4f8cff', weeks: 12 });
  }

  function renderEmptyState(title, message, btnText) {
    return `
      <div class="empty-state">
        <div class="empty-icon">📋</div>
        <h3>${title}</h3>
        <p>${message}</p>
        ${btnText ? `<button class="btn btn-primary" onclick="document.querySelector('.fab').click()">${btnText}</button>` : ''}
      </div>
    `;
  }

  // ── Tasks & Workflows View ───────────────────────────────────────
  function renderTasks() {
    const container = $('#view-tasks');
    const activeTasks = state.tasks.filter(h => !h.archived);
    const archivedTasks = state.tasks.filter(h => h.archived);

    container.innerHTML = `
      <div class="view-header">
        <h1>Tasks & Workflows</h1>
        <p class="text-muted">${activeTasks.length} active task${activeTasks.length !== 1 ? 's' : ''} across ${state.routines.length} workflow${state.routines.length !== 1 ? 's' : ''}</p>
      </div>

      ${state.routines.length > 0 ? `
        <div class="routines-list mb-lg" id="routines-list"></div>
      ` : ''}

      <div class="section-header">
        <h2>Individual Tasks</h2>
      </div>

      <div class="category-filter" id="category-filter">
        <button class="filter-chip active" data-cat="all">All</button>
        ${Object.entries(CATEGORIES).map(([key, cat]) =>
      `<button class="filter-chip" data-cat="${key}" style="--chip-color: ${cat.color}">${cat.icon} ${cat.label}</button>`
    ).join('')}
      </div>

      <div class="tasks-list" id="tasks-list"></div>

      ${archivedTasks.length > 0 ? `
        <div class="section-header mt-lg">
          <h2>Archived</h2>
          <button class="btn-text" id="toggle-archived">Show</button>
        </div>
        <div class="tasks-list archived-list hidden" id="archived-list"></div>
      ` : ''}
    `;

    if (state.routines.length > 0) renderRoutinesList();
    renderTasksList('all');
    initCategoryFilter();
    if (archivedTasks.length > 0) initArchivedToggle();
  }

  function renderTasksList(categoryFilter) {
    const container = $('#tasks-list');
    if (!container) return;

    const tasksInRoutines = new Set();
    state.routines.forEach(r => {
      r.taskIds.forEach(id => tasksInRoutines.add(id));
    });

    let tasks = state.tasks.filter(h => !h.archived && !tasksInRoutines.has(h.id));
    if (categoryFilter !== 'all') tasks = tasks.filter(h => h.category === categoryFilter);

    if (tasks.length === 0) {
      container.innerHTML = renderEmptyState(
        categoryFilter === 'all' ? 'No tasks yet' : `No ${CATEGORIES[categoryFilter]?.label} tasks`,
        'Tap + to add your first task'
      );
      return;
    }

    container.innerHTML = '';
    tasks.forEach(task => {
      const streak = calculateStreak(task.id);
      const bestStreak = calculateBestStreak(task.id);
      const rate = getCompletionRate(task.id, 30);
      const completed = isTaskCompletedToday(task.id);

      const card = el('div', { className: 'card task-card', onClick: () => openTaskDetail(task.id) }, [
        el('div', { className: 'task-card-header' }, [
          el('div', { className: 'task-card-title-row' }, [
            el('span', { className: 'task-card-icon', textContent: CATEGORIES[task.category]?.icon }),
            el('h3', { className: 'task-card-name', textContent: task.name })
          ]),
          el('div', { className: 'task-card-actions' }, [
            el('button', { className: 'btn-icon', textContent: '✏️', title: 'Edit', onClick: (e) => { e.stopPropagation(); openTaskModal(task); } }),
            el('button', { className: 'btn-icon', textContent: '📥', title: 'Archive', onClick: (e) => { e.stopPropagation(); archiveTask(task.id); } })
          ])
        ]),
        el('div', { className: 'task-card-stats' }, [
          el('div', { className: 'task-stat' }, [
            el('span', { className: `streak-badge ${streak >= 7 ? 'hot' : ''}`, innerHTML: `🔥 ${streak}` }),
            el('span', { className: 'task-stat-label', textContent: 'Streak' })
          ]),
          el('div', { className: 'task-stat' }, [
            el('span', { className: 'task-stat-value', textContent: bestStreak.toString() }),
            el('span', { className: 'task-stat-label', textContent: 'Best' })
          ]),
          el('div', { className: 'task-stat' }, [
            el('span', { className: 'task-stat-value', textContent: rate + '%' }),
            el('span', { className: 'task-stat-label', textContent: '30-day' })
          ]),
          el('div', { className: 'task-stat' }, [
            el('span', { className: `today-status ${completed ? 'done' : 'pending'}`, textContent: completed ? '✓' : '○' }),
            el('span', { className: 'task-stat-label', textContent: 'Today' })
          ])
        ]),
        ...(task.metrics && task.metrics.length > 0 ? [
          el('div', { className: 'task-card-metrics' },
            task.metrics.map(m => {
              const pr = getPersonalRecord(task.id, m.id);
              return el('div', { className: 'task-metric-row' }, [
                el('span', { className: 'task-metric-info', textContent: `${m.icon} ${m.name}` }),
                m.target ? el('span', { className: 'task-metric-target', textContent: `Target: ${formatNumber(m.target)} ${m.unit}` }) : null,
                pr.value > 0 ? el('span', { className: 'task-metric-pr', innerHTML: `🏆 PR: ${formatNumber(pr.value)} ${m.unit}` }) : null
              ].filter(Boolean));
            })
          )
        ] : [])
      ]);
      container.appendChild(card);
    });
  }

  function initCategoryFilter() {
    const chips = $$('#category-filter .filter-chip');
    chips.forEach(chip => {
      chip.addEventListener('click', () => {
        chips.forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        renderTasksList(chip.dataset.cat);
      });
    });
  }

  function initArchivedToggle() {
    const btn = $('#toggle-archived');
    const list = $('#archived-list');
    if (!btn || !list) return;
    btn.addEventListener('click', () => {
      list.classList.toggle('hidden');
      btn.textContent = list.classList.contains('hidden') ? 'Show' : 'Hide';
      if (!list.classList.contains('hidden')) {
        list.innerHTML = '';
        state.tasks.filter(h => h.archived).forEach(task => {
          const card = el('div', { className: 'card task-card archived' }, [
            el('div', { className: 'task-card-header' }, [
              el('div', { className: 'task-card-title-row' }, [
                el('span', { textContent: task.name })
              ]),
              el('div', { className: 'task-card-actions' }, [
                el('button', { className: 'btn-icon', textContent: '📤', title: 'Restore', onClick: () => restoreTask(task.id) }),
                el('button', { className: 'btn-icon', textContent: '🗑️', title: 'Delete', onClick: () => deleteTask(task.id) })
              ])
            ])
          ]);
          list.appendChild(card);
        });
      }
    });
  }

  // ── Task Detail (Bottom Sheet) ───────────────────────────
  function openTaskDetail(taskId) {
    const task = getTask(taskId);
    if (!task) return;
    const streak = calculateStreak(taskId);
    const bestStreak = calculateBestStreak(taskId);
    const rate = getCompletionRate(taskId, 30);

    const sheet = createBottomSheet(`
      <div class="task-detail">
        <div class="task-detail-header">
          <div>
            <h2>${task.name}</h2>
            <span class="category-tag category-${task.category}" style="font-size: 1.2em; padding: 2px 6px;">${CATEGORIES[task.category]?.icon}</span>
          </div>
          <div class="task-detail-stats">
            <div class="task-stat"><span class="streak-badge ${streak >= 7 ? 'hot' : ''}">🔥 ${streak}</span><span class="task-stat-label">Streak</span></div>
            <div class="task-stat"><span class="task-stat-value">${bestStreak}</span><span class="task-stat-label">Best</span></div>
            <div class="task-stat"><span class="task-stat-value">${rate}%</span><span class="task-stat-label">30-day</span></div>
          </div>
        </div>

        ${task.metrics && task.metrics.length > 0 ? `
          <div class="task-detail-section">
            <h3>Metrics & Progress</h3>
            ${task.metrics.map(m => `
              <div class="metric-detail-block">
                <div class="metric-detail-header">
                  <span>${m.icon} ${m.name}</span>
                  ${m.target ? `<span class="text-muted">Target: ${formatNumber(m.target)} ${m.unit}</span>` : ''}
                </div>
                <div class="metric-chart" id="chart-${taskId}-${m.id}"></div>
                <div class="metric-stats-row">
                  <span>🏆 PR: ${formatNumber(getPersonalRecord(taskId, m.id).value)} ${m.unit}</span>
                  ${m.target ? `<span>🎯 Hit rate: ${getTargetHitRate(taskId, m.id)}%</span>` : ''}
                </div>
              </div>
            `).join('')}
          </div>
        ` : ''}

        <div class="task-detail-section">
          <h3>Completion History</h3>
          <div id="task-history-chart-${taskId}"></div>
        </div>

        <div class="task-detail-section">
          <h3>Recent Logs</h3>
          <div class="recent-logs" id="recent-logs-${taskId}"></div>
        </div>
      </div>
    `);

    document.body.appendChild(sheet);
    requestAnimationFrame(() => sheet.classList.add('active'));

    // Render metric charts
    setTimeout(() => {
      if (window.Charts && task.metrics) {
        task.metrics.forEach(m => {
          const chartEl = $(`#chart-${taskId}-${m.id}`);
          if (chartEl) {
            const history = getMetricHistory(taskId, m.id, 30);
            if (history.length > 0) {
              Charts.lineChart(chartEl, history, {
                color: CATEGORIES[task.category]?.color || '#4f8cff',
                targetValue: m.target || null,
                showDots: true,
                showArea: true,
                height: 180,
                animated: true
              });
            } else {
              chartEl.innerHTML = '<p class="text-muted text-center">No data yet</p>';
            }
          }
        });
      }

      // Completion bar chart
      const historyChart = $(`#task-history-chart-${taskId}`);
      if (historyChart && window.Charts) {
        const data = [];
        for (let i = 6; i >= 0; i--) {
          const date = daysAgo(i);
          const completed = state.logs.some(l => l.taskId === taskId && l.date === date && l.completed);
          data.push({ label: DAYS[new Date(date + 'T00:00:00').getDay()], value: completed ? 1 : 0 });
        }
        Charts.barChart(historyChart, data, {
          color: CATEGORIES[task.category]?.color || '#4f8cff',
          height: 100,
          animated: true
        });
      }

      // Recent logs
      const recentContainer = $(`#recent-logs-${taskId}`);
      if (recentContainer) {
        const logs = getLogsForTask(taskId, 14).reverse().slice(0, 10);
        if (logs.length === 0) {
          recentContainer.innerHTML = '<p class="text-muted">No logs yet</p>';
        } else {
          logs.forEach(log => {
            const entry = el('div', { className: 'log-entry-mini' }, [
              el('span', { className: 'log-date', textContent: formatDate(log.date) }),
              log.rating ? renderStars(log.rating) : null,
              ...(log.metricValues || []).map(mv => {
                const metric = (task.metrics || []).find(m => m.id === mv.metricId);
                return metric ? el('span', { className: 'metric-badge', textContent: `${metric.icon} ${formatNumber(mv.value)} ${metric.unit}` }) : null;
              }).filter(Boolean),
              log.notes ? el('span', { className: 'log-notes', textContent: log.notes }) : null
            ].filter(Boolean));
            recentContainer.appendChild(entry);
          });
        }
      }
    }, 200);
  }

  // ── Routines List ─────────────────────────────────────────

  function renderRoutinesList() {
    const container = $('#routines-list');
    if (!container) return;
    container.innerHTML = '';

    const byTime = { morning: [], afternoon: [], evening: [] };
    state.routines.forEach(r => {
      if (byTime[r.timeOfDay]) byTime[r.timeOfDay].push(r);
      else byTime.morning.push(r);
    });

    Object.entries(byTime).forEach(([time, routines]) => {
      if (routines.length === 0) return;
      const timeLabels = { morning: 'Morning', afternoon: 'Afternoon', evening: 'Evening' };

      routines.forEach(routine => {
        const tasks = routine.taskIds.map(id => getTask(id)).filter(Boolean);
        const completedCount = tasks.filter(h => isTaskCompletedToday(h.id)).length;
        const progress = tasks.length > 0 ? Math.round((completedCount / tasks.length) * 100) : 0;

        const block = el('div', { className: 'card routine-block' }, [
          el('div', { className: 'routine-block-header' }, [
            el('div', { className: 'routine-time-label' }, [
              el('span', { textContent: getTimeOfDayIcon(time) }),
              el('span', { textContent: `${timeLabels[time]} · ${routine.name}` })
            ]),
            el('div', { className: 'routine-actions' }, [
              el('button', { className: 'btn-icon', textContent: '✏️', onClick: () => openRoutineModal(routine) }),
              el('button', { className: 'btn-icon', textContent: '🗑️', onClick: () => deleteRoutine(routine.id) })
            ])
          ]),
          routine.description ? el('p', { className: 'routine-desc text-muted', textContent: routine.description }) : null,
          el('div', { className: 'routine-tasks' },
            tasks.map(task => {
              const completed = isTaskCompletedToday(task.id);
              return el('div', { className: `routine-task-item ${completed ? 'completed' : ''}` }, [
                el('button', {
                  className: `task-check small ${completed ? 'checked' : ''}`,
                  style: { '--cat-color': CATEGORIES[task.category]?.color },
                  onClick: () => { toggleTaskCompletion(task.id); renderTasks(); }
                }, [
                  el('span', { className: 'check-icon', innerHTML: completed ? '✓' : '' })
                ]),
                el('span', { textContent: task.name }),
                categoryDot(task.category)
              ]);
            })
          ),
          el('div', { className: 'routine-progress' }, [
            el('div', { className: 'routine-progress-bar' }, [
              el('div', { className: 'routine-progress-fill', style: { width: progress + '%' } })
            ]),
            el('span', { className: 'routine-progress-text text-muted', textContent: `${completedCount}/${tasks.length}` })
          ])
        ].filter(Boolean));
        container.appendChild(block);
      });
    });
  }

  // ── Activity Log View ─────────────────────────────────────
  function renderLog() {
    const container = $('#view-log');
    const allLogs = [...state.logs].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);

    container.innerHTML = `
      <div class="view-header">
        <h1>Activity Log</h1>
        <p class="text-muted">${allLogs.length} total entries</p>
      </div>

      <div class="log-filters" id="log-filters">
        <button class="filter-chip active" data-cat="all">All</button>
        ${Object.entries(CATEGORIES).map(([key, cat]) =>
      `<button class="filter-chip" data-cat="${key}" style="--chip-color: ${cat.color}">${cat.icon}</button>`
    ).join('')}
      </div>

      <div class="log-list" id="log-list"></div>
    `;

    renderLogList('all');
    initLogFilters();
  }

  function renderLogList(filter) {
    const container = $('#log-list');
    if (!container) return;
    let logs = [...state.logs].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);

    if (filter !== 'all') {
      logs = logs.filter(l => {
        const h = getTask(l.taskId);
        return h && h.category === filter;
      });
    }

    if (logs.length === 0) {
      container.innerHTML = renderEmptyState('No logs yet', 'Complete a task to see your activity log');
      return;
    }

    container.innerHTML = '';
    let currentDate = '';

    logs.forEach(log => {
      const task = getTask(log.taskId);
      if (!task) return;

      if (log.date !== currentDate) {
        currentDate = log.date;
        container.appendChild(el('div', { className: 'log-date-header', textContent: formatDateFull(log.date) }));
      }

      const entry = el('div', { className: 'card log-entry' }, [
        el('div', { className: 'log-entry-header' }, [
          el('div', { className: 'log-entry-task' }, [
            categoryDot(task.category),
            el('span', { className: 'log-entry-name', textContent: task.name }),
            log.completed ? el('span', { className: 'log-completed-badge', textContent: '✓' }) : null
          ].filter(Boolean)),
          el('div', { className: 'log-entry-actions' }, [
            el('button', { className: 'btn-icon small', textContent: '✏️', onClick: () => openLogModal(task.id, log) }),
            el('button', { className: 'btn-icon small', textContent: '🗑️', onClick: () => { deleteLog(log.id); renderLog(); } })
          ])
        ]),
        (log.metricValues && log.metricValues.length > 0) ? el('div', { className: 'log-entry-metrics' },
          log.metricValues.map(mv => {
            const metric = (task.metrics || []).find(m => m.id === mv.metricId);
            return metric ? el('span', { className: 'metric-badge', textContent: `${metric.icon} ${formatNumber(mv.value)} ${metric.unit}` }) : null;
          }).filter(Boolean)
        ) : null,
        log.rating ? el('div', { className: 'log-entry-rating' }, [renderStars(log.rating)]) : null,
        log.notes ? el('p', { className: 'log-entry-notes', textContent: log.notes }) : null
      ].filter(Boolean));
      container.appendChild(entry);
    });
  }

  function initLogFilters() {
    const chips = $$('#log-filters .filter-chip');
    chips.forEach(chip => {
      chip.addEventListener('click', () => {
        chips.forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        renderLogList(chip.dataset.cat);
      });
    });
  }

  // ── Progress View ─────────────────────────────────────────
  function renderProgress() {
    const container = $('#view-progress');
    const activeTasks = state.tasks.filter(h => !h.archived);
    const tasksWithMetrics = activeTasks.filter(h => h.metrics && h.metrics.length > 0);

    container.innerHTML = `
      <div class="view-header">
        <h1>Progress</h1>
        <p class="text-muted">Track your metrics over time</p>
      </div>

      <div class="progress-period-selector">
        <button class="filter-chip active" data-days="7">7 Days</button>
        <button class="filter-chip" data-days="30">30 Days</button>
        <button class="filter-chip" data-days="90">90 Days</button>
      </div>

      ${tasksWithMetrics.length === 0 ? renderEmptyState('No metrics tracked', 'Add metrics to your tasks to see progress charts') : ''}

      <div id="progress-charts"></div>

      <div class="card records-card" id="records-card">
        <h3>🏆 Personal Records</h3>
        <div id="records-list"></div>
      </div>

      <div class="card comparison-card" id="comparison-card">
        <h3>📊 This Week vs Last Week</h3>
        <div id="comparison-list"></div>
      </div>
    `;

    renderProgressCharts(7);
    renderPersonalRecords();
    renderWeekComparison();
    initPeriodSelector();
  }

  function renderProgressCharts(days) {
    const container = $('#progress-charts');
    if (!container) return;
    container.innerHTML = '';

    const tasksWithMetrics = state.tasks.filter(h => !h.archived && h.metrics && h.metrics.length > 0);

    tasksWithMetrics.forEach(task => {
      task.metrics.forEach(m => {
        const history = getMetricHistory(task.id, m.id, days);
        if (history.length === 0) return;

        const chartCard = el('div', { className: 'card chart-card' }, [
          el('div', { className: 'chart-card-header' }, [
            el('span', { textContent: `${m.icon} ${task.name} — ${m.name}` }),
            m.target ? el('span', { className: 'text-muted', textContent: `Target: ${formatNumber(m.target)} ${m.unit}` }) : null
          ].filter(Boolean)),
          el('div', { className: 'chart-container', id: `progress-chart-${task.id}-${m.id}` })
        ]);
        container.appendChild(chartCard);

        setTimeout(() => {
          if (window.Charts) {
            const chartEl = $(`#progress-chart-${task.id}-${m.id}`);
            if (chartEl) {
              Charts.lineChart(chartEl, history, {
                color: CATEGORIES[task.category]?.color || '#4f8cff',
                targetValue: m.target || null,
                showDots: true,
                showArea: true,
                height: 200,
                animated: true
              });
            }
          }
        }, 100);
      });
    });
  }

  function renderPersonalRecords() {
    const container = $('#records-list');
    if (!container) return;
    container.innerHTML = '';
    let hasRecords = false;

    state.tasks.filter(h => !h.archived && h.metrics && h.metrics.length > 0).forEach(task => {
      task.metrics.forEach(m => {
        const pr = getPersonalRecord(task.id, m.id);
        if (pr.value > 0) {
          hasRecords = true;
          container.appendChild(el('div', { className: 'record-card' }, [
            el('span', { className: 'record-trophy', textContent: '🏆' }),
            el('div', { className: 'record-info' }, [
              el('span', { className: 'record-metric', textContent: `${m.icon} ${m.name}` }),
              el('span', { className: 'record-task text-muted', textContent: task.name })
            ]),
            el('div', { className: 'record-value-block' }, [
              el('span', { className: 'record-value', textContent: `${formatNumber(pr.value)} ${m.unit}` }),
              pr.date ? el('span', { className: 'record-date text-muted', textContent: formatDate(pr.date) }) : null
            ].filter(Boolean))
          ]));
        }
      });
    });

    if (!hasRecords) {
      container.innerHTML = '<p class="text-muted">Complete activities to set records!</p>';
    }
  }

  function renderWeekComparison() {
    const container = $('#comparison-list');
    if (!container) return;
    container.innerHTML = '';
    let hasData = false;

    const metricsUsed = new Map();
    state.tasks.filter(h => !h.archived && h.metrics && h.metrics.length > 0).forEach(h => {
      h.metrics.forEach(m => {
        if (!metricsUsed.has(m.name)) metricsUsed.set(m.name, { icon: m.icon, unit: m.unit });
      });
    });

    metricsUsed.forEach((info, name) => {
      const thisWeek = getMetricTotal(name, 7);
      const lastWeek = getMetricTotalRange(name, 14, 7);
      if (thisWeek === 0 && lastWeek === 0) return;
      hasData = true;
      const diff = lastWeek > 0 ? Math.round(((thisWeek - lastWeek) / lastWeek) * 100) : (thisWeek > 0 ? 100 : 0);
      const isUp = diff >= 0;

      container.appendChild(el('div', { className: 'comparison-row' }, [
        el('span', { className: 'comparison-metric', textContent: `${info.icon} ${name}` }),
        el('div', { className: 'comparison-values' }, [
          el('span', { textContent: `${formatNumber(thisWeek)} ${info.unit}` }),
          el('span', { className: `comparison-diff ${isUp ? 'up' : 'down'}`, textContent: `${isUp ? '↑' : '↓'} ${Math.abs(diff)}%` })
        ]),
        el('span', { className: 'text-muted', textContent: `vs ${formatNumber(lastWeek)}` })
      ]));
    });

    if (!hasData) {
      container.innerHTML = '<p class="text-muted">Track metrics for at least 2 weeks to see comparisons</p>';
    }
  }

  function getMetricTotalRange(metricName, daysAgoStart, daysAgoEnd) {
    const start = daysAgo(daysAgoStart);
    const end = daysAgo(daysAgoEnd);
    let total = 0;
    state.logs.filter(l => l.date >= start && l.date < end && l.metricValues).forEach(l => {
      const task = getTask(l.taskId);
      if (!task) return;
      (l.metricValues || []).forEach(mv => {
        const metric = (task.metrics || []).find(m => m.id === mv.metricId);
        if (metric && metric.name === metricName) total += mv.value || 0;
      });
    });
    return total;
  }

  function initPeriodSelector() {
    const chips = $$('.progress-period-selector .filter-chip');
    chips.forEach(chip => {
      chip.addEventListener('click', () => {
        chips.forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        renderProgressCharts(parseInt(chip.dataset.days));
      });
    });
  }

  // ── Task Actions ─────────────────────────────────────────
  function toggleTaskCompletion(taskId) {
    const t = today();
    const existingLog = state.logs.find(l => l.taskId === taskId && l.date === t && l.completed);

    if (existingLog) {
      // Uncomplete
      state.logs = state.logs.filter(l => l.id !== existingLog.id);
      saveState();
      renderActiveView();
      return;
    }

    // Quick complete (no metrics)
    const task = getTask(taskId);
    if (task && task.metrics && task.metrics.length > 0) {
      openLogModal(taskId);
      return;
    }

    // Simple completion
    state.logs.push({
      id: generateId(),
      taskId,
      date: t,
      completed: true,
      notes: '',
      rating: 0,
      metricValues: [],
      createdAt: Date.now()
    });
    saveState();
    renderActiveView();
    showToast('Task completed! ✓');

    // Check if all tasks completed
    checkAllCompleted();
  }

  function checkAllCompleted() {
    const activeTasks = state.tasks.filter(h => !h.archived);
    const allDone = activeTasks.length > 0 && activeTasks.every(h => isTaskCompletedToday(h.id));
    if (allDone && window.Confetti) {
      window.Confetti.celebrate();
      showToast('🎉 All tasks completed! Amazing!');
    }
  }

  function createTask(data) {
    const task = {
      id: generateId(),
      name: data.name,
      category: data.category,
      frequency: data.frequency || 'daily',
      metrics: (data.metrics || []).map(m => ({
        id: generateId(),
        name: m.name,
        unit: m.unit,
        target: parseFloat(m.target) || 0,
        icon: m.icon
      })),
      archived: false,
      createdAt: Date.now()
    };
    state.tasks.push(task);
    saveState();
    renderActiveView();
    showToast(`"${task.name}" created! 🎯`);
  }

  function updateTask(taskId, data) {
    const task = getTask(taskId);
    if (!task) return;
    task.name = data.name;
    task.category = data.category;
    task.frequency = data.frequency || 'daily';
    // Update metrics carefully to preserve IDs
    const newMetrics = (data.metrics || []).map(m => {
      if (m.id) return m; // existing metric
      return {
        id: generateId(),
        name: m.name,
        unit: m.unit,
        target: parseFloat(m.target) || 0,
        icon: m.icon
      };
    });
    task.metrics = newMetrics;
    saveState();
    renderActiveView();
    showToast(`"${task.name}" updated`);
  }

  function archiveTask(taskId) {
    const task = getTask(taskId);
    if (!task) return;
    task.archived = true;
    saveState();
    renderActiveView();
    showToast(`"${task.name}" archived`);
  }

  function restoreTask(taskId) {
    const task = getTask(taskId);
    if (!task) return;
    task.archived = false;
    saveState();
    renderActiveView();
    showToast(`"${task.name}" restored`);
  }

  function deleteTask(taskId) {
    state.tasks = state.tasks.filter(h => h.id !== taskId);
    state.logs = state.logs.filter(l => l.taskId !== taskId);
    state.routines.forEach(r => {
      r.taskIds = r.taskIds.filter(id => id !== taskId);
    });
    saveState();
    renderActiveView();
    showToast('Task deleted');
  }

  // ── Log Actions ───────────────────────────────────────────
  function createLog(data) {
    // Remove existing log for same task+date if completing
    if (data.completed) {
      state.logs = state.logs.filter(l => !(l.taskId === data.taskId && l.date === data.date && l.completed));
    }

    state.logs.push({
      id: generateId(),
      taskId: data.taskId,
      date: data.date || today(),
      completed: data.completed !== false,
      notes: data.notes || '',
      rating: data.rating || 0,
      metricValues: data.metricValues || [],
      createdAt: Date.now()
    });
    saveState();
    renderActiveView();
    showToast('Activity logged! 📝');
    checkAllCompleted();
  }

  function updateLog(logId, data) {
    const log = state.logs.find(l => l.id === logId);
    if (!log) return;
    Object.assign(log, data);
    saveState();
    renderActiveView();
    showToast('Log updated');
  }

  function deleteLog(logId) {
    state.logs = state.logs.filter(l => l.id !== logId);
    saveState();
    showToast('Log deleted');
  }

  // ── Routine Actions ───────────────────────────────────────
  function createRoutine(data) {
    state.routines.push({
      id: generateId(),
      name: data.name,
      timeOfDay: data.timeOfDay,
      taskIds: data.taskIds || [],
      description: data.description || '',
      createdAt: Date.now()
    });
    saveState();
    renderActiveView();
    showToast(`"${data.name}" workflow created! 🔁`);
  }

  function updateRoutine(routineId, data) {
    const routine = state.routines.find(r => r.id === routineId);
    if (!routine) return;
    Object.assign(routine, data);
    saveState();
    renderActiveView();
    showToast('Workflow updated');
  }

  function deleteRoutine(routineId) {
    state.routines = state.routines.filter(r => r.id !== routineId);
    saveState();
    renderActiveView();
    showToast('Workflow deleted');
  }

  // ── Bottom Sheet System ───────────────────────────────────
  function createBottomSheet(content) {
    const overlay = el('div', { className: 'bottom-sheet-overlay', onClick: closeBottomSheet });
    const sheet = el('div', { className: 'bottom-sheet' }, [
      el('div', { className: 'sheet-handle' }),
      el('div', { className: 'sheet-content', innerHTML: content })
    ]);
    const wrapper = el('div', { className: 'bottom-sheet-wrapper' }, [overlay, sheet]);

    // Swipe down to close
    let startY = 0, currentY = 0;
    sheet.addEventListener('touchstart', e => { startY = e.touches[0].clientY; });
    sheet.addEventListener('touchmove', e => {
      currentY = e.touches[0].clientY;
      const diff = currentY - startY;
      if (diff > 0) {
        sheet.style.transform = `translateY(${diff}px)`;
      }
    });
    sheet.addEventListener('touchend', () => {
      if (currentY - startY > 100) closeBottomSheet();
      else sheet.style.transform = '';
    });

    return wrapper;
  }

  function closeBottomSheet() {
    const wrapper = $('.bottom-sheet-wrapper');
    if (wrapper) {
      wrapper.querySelector('.bottom-sheet').style.transform = 'translateY(100%)';
      setTimeout(() => wrapper.remove(), 300);
    }
  }

  // ── Data Management Functions ─────────────────────────────────────
  function openDataModal() {
    const content = `
      <h2>Data Management</h2>
      <button class="btn btn-primary" id="export-btn">Export Data</button>
      <button class="btn btn-secondary" id="import-btn">Import Data</button>
      <button class="btn btn-text" id="close-data-modal">Cancel</button>
    `;
    const wrapper = createBottomSheet(content);
    document.body.appendChild(wrapper);
    // Attach listeners
    $('#export-btn').addEventListener('click', exportData);
    $('#import-btn').addEventListener('click', () => $('#import-file').click());
    $('#close-data-modal').addEventListener('click', closeBottomSheet);
  }

  function exportData() {
    const data = { tasks: state.tasks, routines: state.routines, logs: state.logs };
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `track_data_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Data exported');
  }

  function importData(file) {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const data = JSON.parse(e.target.result);
        state.tasks = data.tasks || [];
        state.routines = data.routines || [];
        state.logs = data.logs || [];
        saveState();
        renderActiveView();
        showToast('Data imported');
      } catch (err) {
        console.error(err);
        showToast('Import failed', 'error');
      }
    };
    reader.readAsText(file);
  }

  // Hook import file input
  $('#import-file').addEventListener('change', e => {
    const file = e.target.files[0];
    if (file) importData(file);
    e.target.value = '';
  });

  // ── Task Modal ───────────────────────────────────────────
  function openTaskModal(existingTask = null) {
    const isEdit = !!existingTask;
    let metrics = isEdit ? [...(existingTask.metrics || [])] : [];
    let selectedCategory = isEdit ? existingTask.category : 'work';

    const sheet = createBottomSheet(`
      <h2>${isEdit ? 'Edit Task' : 'New Task'}</h2>
      <form id="task-form" class="sheet-form">
        <div class="form-group">
          <label>Task Name</label>
          <input type="text" id="task-name" placeholder="e.g., Morning Run" value="${isEdit ? existingTask.name : ''}" required>
        </div>

        <div class="form-group">
          <label>Category</label>
          <div class="category-selector" id="category-selector">
            ${Object.entries(CATEGORIES).map(([key, cat]) =>
      `<button type="button" class="category-option ${key === selectedCategory ? 'active' : ''}" data-cat="${key}" style="--cat-color: ${cat.color}">
                ${cat.icon} ${cat.label}
              </button>`
    ).join('')}
          </div>
        </div>

        <div class="form-group">
          <label>Frequency</label>
          <select id="task-frequency">
            <option value="daily" ${!isEdit || existingTask.frequency === 'daily' ? 'selected' : ''}>Daily</option>
            <option value="weekly" ${isEdit && existingTask.frequency === 'weekly' ? 'selected' : ''}>Weekly</option>
          </select>
        </div>

        <div class="form-group">
          <label>Metrics (Track Progress)</label>
          <div id="metrics-list" class="metrics-list"></div>
          <button type="button" class="btn btn-secondary w-full" id="add-metric-btn">+ Add Metric</button>
        </div>

        <div class="form-actions">
          <button type="button" class="btn btn-secondary" onclick="document.querySelector('.bottom-sheet-wrapper .bottom-sheet-overlay').click()">Cancel</button>
          <button type="submit" class="btn btn-primary">${isEdit ? 'Save Changes' : 'Create Task'}</button>
        </div>
      </form>
    `);

    document.body.appendChild(sheet);
    requestAnimationFrame(() => sheet.classList.add('active'));

    // Category selector
    sheet.querySelectorAll('.category-option').forEach(btn => {
      btn.addEventListener('click', () => {
        sheet.querySelectorAll('.category-option').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        selectedCategory = btn.dataset.cat;
      });
    });

    // Metrics
    function renderMetrics() {
      const list = sheet.querySelector('#metrics-list');
      list.innerHTML = '';
      metrics.forEach((m, idx) => {
        const row = el('div', { className: 'metric-edit-row' }, [
          el('span', { className: 'metric-edit-icon', textContent: m.icon }),
          el('span', { className: 'metric-edit-name', textContent: `${m.name} (${m.unit})` }),
          m.target ? el('span', { className: 'metric-edit-target text-muted', textContent: `Target: ${m.target}` }) : null,
          el('button', { type: 'button', className: 'btn-icon small', textContent: '✏️', onClick: () => openMetricEditor(idx) }),
          el('button', { type: 'button', className: 'btn-icon small', textContent: '✕', onClick: () => { metrics.splice(idx, 1); renderMetrics(); } })
        ].filter(Boolean));
        list.appendChild(row);
      });
    }
    renderMetrics();

    sheet.querySelector('#add-metric-btn').addEventListener('click', () => openMetricPicker(m => { metrics.push(m); renderMetrics(); }));

    // Submit
    sheet.querySelector('#task-form').addEventListener('submit', e => {
      e.preventDefault();
      const name = sheet.querySelector('#task-name').value.trim();
      if (!name) return;

      const data = {
        name,
        category: selectedCategory,
        frequency: sheet.querySelector('#task-frequency').value,
        metrics
      };

      if (isEdit) updateTask(existingTask.id, data);
      else createTask(data);

      closeBottomSheet();
    });

    function openMetricEditor(idx) {
      // Inline edit target
      const m = metrics[idx];
      const newTarget = prompt(`Set target for ${m.name} (${m.unit}):`, m.target || '');
      if (newTarget !== null) {
        m.target = parseFloat(newTarget) || 0;
        renderMetrics();
      }
    }
  }

  // ── Metric Picker Modal ───────────────────────────────────
  function openMetricPicker(onSelect) {
    const existingSheet = $('.bottom-sheet-wrapper');

    const pickerOverlay = el('div', { className: 'metric-picker-overlay' });
    const picker = el('div', { className: 'metric-picker-modal' }, [
      el('h3', { textContent: 'Choose Metric' }),
      el('div', { className: 'metric-preset-grid' },
        METRIC_PRESETS.map(preset => {
          const isCustom = preset.name === 'Custom';
          return el('button', {
            className: 'metric-preset-btn',
            onClick: () => {
              if (isCustom) {
                const name = prompt('Metric name:');
                const unit = prompt('Unit (e.g., reps, km, min):');
                const target = prompt('Daily target (optional):');
                if (name && unit) {
                  onSelect({ name, unit, icon: '📏', target: parseFloat(target) || 0 });
                }
              } else {
                const target = prompt(`Daily target for ${preset.name} (${preset.unit}), or leave empty:`);
                onSelect({ ...preset, target: parseFloat(target) || 0 });
              }
              pickerOverlay.remove();
              picker.remove();
            }
          }, [
            el('span', { className: 'metric-preset-icon', textContent: preset.icon }),
            el('span', { className: 'metric-preset-name', textContent: preset.name }),
            !isCustom ? el('span', { className: 'metric-preset-unit text-muted', textContent: preset.unit }) : null
          ].filter(Boolean));
        })
      ),
      el('button', { className: 'btn btn-secondary w-full mt-md', textContent: 'Cancel', onClick: () => { pickerOverlay.remove(); picker.remove(); } })
    ]);

    pickerOverlay.addEventListener('click', () => { pickerOverlay.remove(); picker.remove(); });

    document.body.appendChild(pickerOverlay);
    document.body.appendChild(picker);
    requestAnimationFrame(() => { pickerOverlay.classList.add('active'); picker.classList.add('active'); });
  }

  // ── Log Modal ─────────────────────────────────────────────
  function openLogModal(taskId, existingLog = null) {
    const task = getTask(taskId);
    if (!task) return;
    const isEdit = !!existingLog;

    const sheet = createBottomSheet(`
      <h2>${isEdit ? 'Edit Log' : 'Log Activity'}</h2>
      <p class="text-muted">${task.name}</p>
      <form id="log-form" class="sheet-form">
        ${task.metrics && task.metrics.length > 0 ? `
          <div class="form-group">
            <label>Metrics</label>
            ${task.metrics.map(m => {
      const existing = isEdit && existingLog.metricValues ? existingLog.metricValues.find(v => v.metricId === m.id) : null;
      return `
                <div class="metric-input-row">
                  <span class="metric-input-label">${m.icon} ${m.name}</span>
                  <div class="metric-input-field">
                    <input type="number" step="any" id="metric-${m.id}" placeholder="0" value="${existing ? existing.value : ''}" min="0">
                    <span class="metric-input-unit">${m.unit}</span>
                  </div>
                  ${m.target ? `<span class="text-muted text-sm">Target: ${formatNumber(m.target)}</span>` : ''}
                </div>
              `;
    }).join('')}
          </div>
        ` : ''}

        <div class="form-group">
          <label>Rating</label>
          <div id="log-rating" class="rating-input"></div>
        </div>

        <div class="form-group">
          <label>Notes</label>
          <textarea id="log-notes" placeholder="How did it go?" rows="3">${isEdit ? existingLog.notes || '' : ''}</textarea>
        </div>

        <div class="form-actions">
          <button type="button" class="btn btn-secondary" onclick="document.querySelector('.bottom-sheet-wrapper .bottom-sheet-overlay').click()">Cancel</button>
          <button type="submit" class="btn btn-primary">${isEdit ? 'Update' : 'Log Activity'}</button>
        </div>
      </form>
    `);

    document.body.appendChild(sheet);
    requestAnimationFrame(() => sheet.classList.add('active'));

    // Rating
    let rating = isEdit ? (existingLog.rating || 0) : 0;
    const ratingContainer = sheet.querySelector('#log-rating');
    function renderRating() {
      ratingContainer.innerHTML = '';
      ratingContainer.appendChild(renderStars(rating, true, r => { rating = r; renderRating(); }));
    }
    renderRating();

    // Submit
    sheet.querySelector('#log-form').addEventListener('submit', e => {
      e.preventDefault();
      const metricValues = (task.metrics || []).map(m => {
        const input = sheet.querySelector(`#metric-${m.id}`);
        return { metricId: m.id, value: parseFloat(input?.value) || 0 };
      }).filter(mv => mv.value > 0);

      const data = {
        taskId,
        date: isEdit ? existingLog.date : today(),
        completed: true,
        notes: sheet.querySelector('#log-notes').value.trim(),
        rating,
        metricValues
      };

      if (isEdit) updateLog(existingLog.id, data);
      else createLog(data);

      closeBottomSheet();
    });
  }

  // ── Routine Modal ─────────────────────────────────────────
  function openRoutineModal(existingRoutine = null) {
    const isEdit = !!existingRoutine;
    const activeTasks = state.tasks.filter(h => !h.archived);
    let selectedTasks = isEdit ? [...existingRoutine.taskIds] : [];

    const sheet = createBottomSheet(`
      <h2>${isEdit ? 'Edit Workflow' : 'New Workflow'}</h2>
      <form id="routine-form" class="sheet-form">
        <div class="form-group">
          <label>Workflow Name</label>
          <input type="text" id="routine-name" placeholder="e.g., Morning Power Hour" value="${isEdit ? existingRoutine.name : ''}" required>
        </div>

        <div class="form-group">
          <label>Time of Day</label>
          <div class="time-selector">
            <button type="button" class="time-option ${!isEdit || existingRoutine.timeOfDay === 'morning' ? 'active' : ''}" data-time="morning">🌅 Morning</button>
            <button type="button" class="time-option ${isEdit && existingRoutine.timeOfDay === 'afternoon' ? 'active' : ''}" data-time="afternoon">☀️ Afternoon</button>
            <button type="button" class="time-option ${isEdit && existingRoutine.timeOfDay === 'evening' ? 'active' : ''}" data-time="evening">🌙 Evening</button>
          </div>
        </div>

        <div class="form-group">
          <label>Description (optional)</label>
          <textarea id="routine-desc" placeholder="What's this routine about?" rows="2">${isEdit ? existingRoutine.description || '' : ''}</textarea>
        </div>

        <div class="form-group">
          <label>Tasks in this Workflow</label>
          <div class="task-selector" id="task-selector">
            ${activeTasks.length === 0 ? '<p class="text-muted">Create some tasks first</p>' : ''}
            ${activeTasks.map(h => `
              <label class="task-select-item">
                <div class="task-check" style="position: relative; width: 22px; height: 22px; flex-shrink: 0; background: var(--bg-surface-2); border: 2px solid rgba(255,255,255,0.15); border-radius: 6px;">
                  <input type="checkbox" value="${h.id}" ${selectedTasks.includes(h.id) ? 'checked' : ''} style="position: absolute; opacity: 0; width: 100%; height: 100%; cursor: pointer; margin: 0; z-index: 2;">
                  <div class="task-check__indicator" style="position: absolute; top: -2px; left: -2px; right: -2px; bottom: -2px; border-radius: 6px; pointer-events: none;"></div>
                </div>
                <span>${h.name}</span>
                <span style="margin-left: auto; font-size: 1.1em; opacity: 0.9;">${CATEGORIES[h.category]?.icon || ''}</span>
              </label>
            `).join('')}
          </div>
        </div>

        <div class="form-actions">
          <button type="button" class="btn btn-secondary" onclick="document.querySelector('.bottom-sheet-wrapper .bottom-sheet-overlay').click()">Cancel</button>
          <button type="submit" class="btn btn-primary">${isEdit ? 'Save Changes' : 'Create Workflow'}</button>
        </div>
      </form>
    `);

    document.body.appendChild(sheet);
    requestAnimationFrame(() => sheet.classList.add('active'));

    // Time selector
    let selectedTime = isEdit ? existingRoutine.timeOfDay : 'morning';
    sheet.querySelectorAll('.time-option').forEach(btn => {
      btn.addEventListener('click', () => {
        sheet.querySelectorAll('.time-option').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        selectedTime = btn.dataset.time;
      });
    });

    // Submit
    sheet.querySelector('#routine-form').addEventListener('submit', e => {
      e.preventDefault();
      const name = sheet.querySelector('#routine-name').value.trim();
      if (!name) return;

      const taskIds = Array.from(sheet.querySelectorAll('#task-selector input:checked')).map(cb => cb.value);

      const data = {
        name,
        timeOfDay: selectedTime,
        description: sheet.querySelector('#routine-desc').value.trim(),
        taskIds
      };

      if (isEdit) updateRoutine(existingRoutine.id, data);
      else createRoutine(data);

      closeBottomSheet();
    });
  }

  // ── FAB (Floating Action Button) ──────────────────────────
  function initFab() {
    const fab = $('.fab');
    if (!fab) return;

    fab.addEventListener('click', () => {
      // Show quick action menu
      const menu = el('div', { className: 'fab-menu' }, [
        el('div', { className: 'fab-menu-overlay', onClick: closeFabMenu }),
        el('div', { className: 'fab-menu-items' }, [
          el('button', { className: 'fab-menu-item', onClick: () => { closeFabMenu(); openTaskModal(); } }, [
            el('span', { className: 'fab-menu-icon', textContent: '🎯' }),
            el('span', { textContent: 'New Task' })
          ]),
          el('button', { className: 'fab-menu-item', onClick: () => { closeFabMenu(); openRoutineModal(); } }, [
            el('span', { className: 'fab-menu-icon', textContent: '🔁' }),
            el('span', { textContent: 'New Workflow' })
          ])
        ].filter(Boolean))
      ]);

      document.body.appendChild(menu);
      requestAnimationFrame(() => menu.classList.add('active'));
    });
  }

  function closeFabMenu() {
    const menu = $('.fab-menu');
    if (menu) {
      menu.classList.remove('active');
      setTimeout(() => menu.remove(), 200);
    }
  }

  function openQuickLogPicker() {
    const activeTasks = state.tasks.filter(h => !h.archived);
    const sheet = createBottomSheet(`
      <h2>Quick Log</h2>
      <p class="text-muted">Select a task to log</p>
      <div class="quick-log-list">
        ${activeTasks.map(h => `
          <button class="quick-log-item" data-id="${h.id}">
            <span class="task-select-dot" style="background: ${CATEGORIES[h.category]?.color}"></span>
            <span>${h.name}</span>
            <span class="text-muted">${isTaskCompletedToday(h.id) ? '✓ Done' : ''}</span>
          </button>
        `).join('')}
      </div>
    `);

    document.body.appendChild(sheet);
    requestAnimationFrame(() => sheet.classList.add('active'));

    sheet.querySelectorAll('.quick-log-item').forEach(btn => {
      btn.addEventListener('click', () => {
        closeBottomSheet();
        setTimeout(() => openLogModal(btn.dataset.id), 300);
      });
    });
  }

  // ── Update streak badge in top bar ────────────────────────
  function updateTopBar() {
    const streakEl = $('#top-streak');
    if (streakEl) {
      const streak = getMaxStreak();
      streakEl.textContent = streak > 0 ? `🔥 ${streak}` : '';
      streakEl.className = `streak-badge top-streak ${streak >= 7 ? 'hot' : ''} ${streak === 0 ? 'hidden' : ''}`;
    }

    const dateEl = $('#top-date');
    if (dateEl) {
      dateEl.textContent = formatDate(today());
    }
  }

  // ── Pull to Refresh ───────────────────────────────────────
  function initPullToRefresh() {
    const main = $('main');
    if (!main) return;
    let startY = 0, pulling = false;
    const indicator = $('.pull-indicator');

    main.addEventListener('touchstart', e => {
      if (main.scrollTop === 0) {
        startY = e.touches[0].clientY;
        pulling = true;
      }
    });

    main.addEventListener('touchmove', e => {
      if (!pulling) return;
      const diff = e.touches[0].clientY - startY;
      if (diff > 0 && diff < 120) {
        if (indicator) {
          indicator.style.transform = `translateY(${diff - 40}px)`;
          indicator.style.opacity = diff / 80;
        }
      }
    });

    main.addEventListener('touchend', e => {
      if (!pulling) return;
      pulling = false;
      if (indicator) {
        indicator.style.transform = '';
        indicator.style.opacity = '';
      }
      renderActiveView();
      updateTopBar();
    });
  }

  // ── Authentication ──────────────────────────────────────────
  function initAuth() {
    if (!supabase) {
      // Fallback to local only mode
      currentUser = { id: 'local_user' };
      $('#view-login').style.display = 'none';
      $('#app-main').style.display = 'block';
      $('#app-header').style.display = 'flex';
      $('#app-nav').style.display = 'flex';
      $('.fab').style.display = 'flex';
      initApp();
      return;
    }

    supabase.auth.onAuthStateChange((event, session) => {
      if (session && session.user) {
        currentUser = session.user;
        $('#view-login').style.display = 'none';
        $('#app-main').style.display = 'block';
        $('#app-header').style.display = 'flex';
        $('#app-nav').style.display = 'flex';
        $('.fab').style.display = 'flex';
        
        initApp();
      } else {
        currentUser = null;
        $('#view-login').style.display = 'flex';
        $('#app-main').style.display = 'none';
        $('#app-header').style.display = 'none';
        $('#app-nav').style.display = 'none';
        $('.fab').style.display = 'none';
        
        // Clear state
        state.tasks = [];
        state.routines = [];
        state.logs = [];
        localStorage.removeItem(STORAGE_KEY);
      }
    });

    // Form listeners
    $('#auth-login-btn').addEventListener('click', async (e) => {
      e.preventDefault();
      const email = $('#auth-email').value;
      const password = $('#auth-password').value;
      if (!email || !password) return showToast('Enter email and password', 'error');
      
      const btn = $('#auth-login-btn');
      btn.textContent = 'Logging in...';
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      btn.textContent = 'Log In';
      
      if (error) {
        $('#auth-message').textContent = error.message;
        $('#auth-message').style.color = 'var(--color-danger)';
      }
    });

    $('#auth-signup-btn').addEventListener('click', async (e) => {
      e.preventDefault();
      const email = $('#auth-email').value;
      const password = $('#auth-password').value;
      if (!email || !password) return showToast('Enter email and password', 'error');
      
      const btn = $('#auth-signup-btn');
      btn.textContent = 'Signing up...';
      const { data, error } = await supabase.auth.signUp({ email, password });
      btn.textContent = 'Sign Up';
      
      if (error) {
        $('#auth-message').textContent = error.message;
        $('#auth-message').style.color = 'var(--color-danger)';
      } else {
        $('#auth-message').textContent = 'Check your email for the confirmation link!';
        $('#auth-message').style.color = 'var(--color-health)';
      }
    });
  }

  // ── Initialize App ────────────────────────────────────────
  let initialized = false;
  function initApp() {
    loadState();
    if (!initialized) {
      initNavigation();
      initFab();
      initPullToRefresh();
      initialized = true;
    }
    updateTopBar();
    renderDashboard();

    // Trigger cloud sync in background
    syncFromCloud();
  }

  // Start when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAuth);
  } else {
    initAuth();
  }
})();
