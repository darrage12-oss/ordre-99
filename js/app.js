/**
 * app.js
 * Main application controller: routing, modal management,
 * toast notifications, dark mode, import/export
 */

const App = (() => {
  'use strict';

  /* ---- View titles ---- */
  const VIEW_TITLES = {
    dashboard: 'Tableau de bord',
    create:    'Créer un Ordre de Mission',
    history:   'Historique des Missions',
    agents:    'Gestion des Agents'
  };

  /* ---- Switch view ---- */

  function switchView(viewName) {
    // Hide all views
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));

    // Show target
    const target = document.getElementById(`view-${viewName}`);
    if (target) target.classList.add('active');

    // Update sidebar active state
    document.querySelectorAll('.nav-item').forEach(a => {
      a.classList.toggle('active', a.dataset.view === viewName);
    });

    // Update topbar title
    const titleEl = document.getElementById('topbar-title');
    if (titleEl) titleEl.textContent = VIEW_TITLES[viewName] || '';

    // Per-view refresh
    if (viewName === 'dashboard') {
      Dashboard.render();
    } else if (viewName === 'create') {
      Users.fillMissionForm();
      Missions.refreshFormHeader();
    } else if (viewName === 'history') {
      History.render();
    } else if (viewName === 'agents') {
      Users.renderList();
    }

    // Close mobile sidebar
    closeMobileSidebar();
  }

  /* ---- Sidebar (mobile) ---- */

  function openMobileSidebar() {
    document.getElementById('sidebar').classList.add('open');
    document.getElementById('sidebar-overlay').classList.add('open');
  }

  function closeMobileSidebar() {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebar-overlay').classList.remove('open');
  }

  /* ---- Dark Mode ---- */

  function toggleDarkMode() {
    const isDark = document.body.classList.toggle('dark-mode');
    localStorage.setItem('ordre_mission_dark_mode', isDark ? '1' : '0');
    _updateDarkIcon(isDark);
    // Redraw charts with new colors
    if (document.getElementById('view-dashboard').classList.contains('active')) {
      requestAnimationFrame(() => {
        Dashboard.drawBarChart();
        Dashboard.drawHorizontalBarChart();
      });
    }
  }

  function _updateDarkIcon(isDark) {
    const icon = document.getElementById('dark-icon');
    if (!icon) return;
    if (isDark) {
      icon.classList.remove('fa-moon');
      icon.classList.add('fa-sun');
    } else {
      icon.classList.remove('fa-sun');
      icon.classList.add('fa-moon');
    }
  }

  function _applyDarkMode() {
    const saved = localStorage.getItem('ordre_mission_dark_mode');
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    const isDark = saved === '1' || (saved === null && prefersDark);
    if (isDark) {
      document.body.classList.add('dark-mode');
    }
    _updateDarkIcon(document.body.classList.contains('dark-mode'));
  }

  /* ---- Modal helpers ---- */

  function openModal(id) {
    const overlay = document.getElementById(id);
    if (overlay) {
      overlay.classList.add('open');
      // Focus first input inside modal
      setTimeout(() => {
        const firstInput = overlay.querySelector('input:not([readonly]):not([type="hidden"]), textarea, select');
        if (firstInput) firstInput.focus();
      }, 220);
    }
  }

  function closeModal(id) {
    const overlay = document.getElementById(id);
    if (overlay) overlay.classList.remove('open');
  }

  /* ---- Confirm modal ---- */

  let _confirmCallback = null;

  function showConfirm(message, onConfirm) {
    const msgEl = document.getElementById('confirm-message');
    if (msgEl) msgEl.innerHTML = message;
    _confirmCallback = onConfirm;
    openModal('confirm-modal');
  }

  /* ---- Toast ---- */

  function showToast(title, message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const iconMap = {
      success: 'fa-circle-check',
      error:   'fa-circle-xmark',
      warning: 'fa-triangle-exclamation',
      info:    'fa-circle-info'
    };

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
      <i class="fa-solid ${iconMap[type] || iconMap.info}"></i>
      <div class="toast-content">
        ${title ? `<div class="toast-title">${title}</div>` : ''}
        ${message ? `<div class="toast-msg">${message}</div>` : ''}
      </div>`;

    container.appendChild(toast);

    // Auto-remove
    const duration = type === 'error' ? 5000 : 3500;
    setTimeout(() => {
      toast.style.animation = 'toast-out 0.3s ease forwards';
      setTimeout(() => {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 300);
    }, duration);
  }

  /* ---- Import / Export ---- */

  function exportJSON() {
    const data = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      users: JSON.parse(localStorage.getItem('ordre_mission_users') || '[]'),
      missions: JSON.parse(localStorage.getItem('ordre_mission_missions') || '[]'),
      counters: {}
    };

    // Collect counters
    const year = new Date().getFullYear();
    for (let y = year - 5; y <= year + 1; y++) {
      const key = `ordre_mission_counter_${y}`;
      const val = localStorage.getItem(key);
      if (val) data.counters[key] = val;
    }

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `sauvegarde-ordres-mission-${new Date().toISOString().slice(0,10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('Sauvegarde exportée', 'Fichier JSON téléchargé.', 'success');
  }

  function importJSON(file) {
    const reader = new FileReader();
    reader.onload = function(e) {
      try {
        const data = JSON.parse(e.target.result);
        if (!data.users && !data.missions) {
          showToast('Fichier invalide', 'Le fichier ne contient pas de données valides.', 'error');
          return;
        }

        // Merge users
        if (data.users && Array.isArray(data.users)) {
          const existing = JSON.parse(localStorage.getItem('ordre_mission_users') || '[]');
          const merged = [...existing];
          data.users.forEach(u => {
            if (!merged.find(x => x.id === u.id)) merged.push(u);
          });
          localStorage.setItem('ordre_mission_users', JSON.stringify(merged));
        }

        // Merge missions
        if (data.missions && Array.isArray(data.missions)) {
          const existing = JSON.parse(localStorage.getItem('ordre_mission_missions') || '[]');
          const merged = [...existing];
          data.missions.forEach(m => {
            if (!merged.find(x => x.id === m.id)) merged.push(m);
          });
          localStorage.setItem('ordre_mission_missions', JSON.stringify(merged));
        }

        // Restore counters
        if (data.counters) {
          Object.entries(data.counters).forEach(([k, v]) => {
            localStorage.setItem(k, v);
          });
        }

        // Refresh views
        Users.renderList();
        Users.populateDropdown(document.getElementById('active-agent-select'));
        History.populateAgentFilter();
        History.render();
        Dashboard.render();

        closeModal('io-modal');
        showToast('Importation réussie', 'Les données ont été importées.', 'success');
        if (typeof CloudSync !== 'undefined') CloudSync.onLocalChange();
      } catch (err) {
        console.error(err);
        showToast('Erreur', 'Fichier JSON invalide ou corrompu.', 'error');
      }
    };
    reader.readAsText(file);
  }

  function resetAllData() {
    showConfirm(
      '<strong style="color:var(--danger)">Attention !</strong> Cette action supprimera définitivement <strong>toutes</strong> les données (agents, missions, compteurs). Êtes-vous absolument sûr ?',
      () => {
        const keys = Object.keys(localStorage).filter(k => k.startsWith('ordre_mission'));
        keys.forEach(k => localStorage.removeItem(k));

        Users.renderList();
        Users.populateDropdown(document.getElementById('active-agent-select'));
        History.populateAgentFilter();
        History.render();
        Dashboard.render();
        Missions.resetForm();
        Missions.refreshFormHeader();

        closeModal('io-modal');
        showToast('Données réinitialisées', 'Toutes les données ont été supprimées.', 'warning');
      }
    );
  }

  /* ---- Wire up all event listeners ---- */

  function _bindEvents() {

    /* Sidebar nav links */
    document.querySelectorAll('.nav-item[data-view]').forEach(a => {
      a.addEventListener('click', function(e) {
        e.preventDefault();
        switchView(this.dataset.view);
      });
    });

    /* Mobile sidebar toggle */
    const sidebarToggle = document.getElementById('sidebar-toggle');
    if (sidebarToggle) sidebarToggle.addEventListener('click', openMobileSidebar);

    const overlay = document.getElementById('sidebar-overlay');
    if (overlay) overlay.addEventListener('click', closeMobileSidebar);

    /* Dark mode */
    const dmToggle = document.getElementById('dark-mode-toggle');
    if (dmToggle) dmToggle.addEventListener('click', toggleDarkMode);

    /* Generic modal close buttons */
    document.querySelectorAll('[data-close-modal]').forEach(btn => {
      btn.addEventListener('click', function() {
        closeModal(this.dataset.closeModal);
      });
    });

    /* Close modal on overlay click */
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
      overlay.addEventListener('click', function(e) {
        if (e.target === this) closeModal(this.id);
      });
    });

    /* Confirm modal ok button */
    const confirmOk = document.getElementById('confirm-ok');
    if (confirmOk) {
      confirmOk.addEventListener('click', () => {
        closeModal('confirm-modal');
        if (_confirmCallback) {
          _confirmCallback();
          _confirmCallback = null;
        }
      });
    }

    const confirmCancel = document.getElementById('confirm-cancel');
    if (confirmCancel) {
      confirmCancel.addEventListener('click', () => {
        _confirmCallback = null;
        closeModal('confirm-modal');
      });
    }

    /* Import/Export modal open */
    const ioBtn = document.getElementById('open-io-modal');
    if (ioBtn) {
      ioBtn.addEventListener('click', e => {
        e.preventDefault();
        openModal('io-modal');
        closeMobileSidebar();
      });
    }

    /* Export JSON */
    const exportBtn = document.getElementById('btn-export-json');
    if (exportBtn) exportBtn.addEventListener('click', exportJSON);

    /* Import: file picker */
    const pickBtn = document.getElementById('btn-pick-import');
    const fileInput = document.getElementById('import-file-input');
    if (pickBtn && fileInput) {
      pickBtn.addEventListener('click', () => fileInput.click());
      fileInput.addEventListener('change', function() {
        if (this.files && this.files[0]) {
          const name = document.getElementById('import-file-name');
          if (name) name.textContent = this.files[0].name;
          const importBtn = document.getElementById('btn-import-json');
          if (importBtn) importBtn.style.display = 'inline-flex';
        }
      });
    }

    /* Import confirm */
    const importBtn = document.getElementById('btn-import-json');
    if (importBtn) {
      importBtn.addEventListener('click', () => {
        const file = fileInput && fileInput.files && fileInput.files[0];
        if (file) importJSON(file);
      });
    }

    /* Reset all data */
    const resetBtn = document.getElementById('btn-reset-all');
    if (resetBtn) resetBtn.addEventListener('click', resetAllData);

    /* Keyboard: Escape closes modals */
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        document.querySelectorAll('.modal-overlay.open').forEach(m => {
          closeModal(m.id);
        });
      }
    });
  }

  /* ---- Init ---- */

  function init() {
    _applyDarkMode();
    _bindEvents();

    // Init all modules
    Users.init();
    Missions.init();
    History.init();
    Dashboard.init();
    PDF.init();

    // Default view
    switchView('dashboard');

    console.log('[App] Ordre de Mission – SRM TTA initialized.');
  }

  /* ---- DOMContentLoaded ---- */

  document.addEventListener('DOMContentLoaded', init);

  return {
    init,
    switchView,
    openModal,
    closeModal,
    showConfirm,
    showToast,
    toggleDarkMode
  };
})();
