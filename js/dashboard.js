/**
 * dashboard.js
 * Renders the dashboard: stat cards, canvas charts, recent missions table
 */

const Dashboard = (() => {
  'use strict';

  const MONTH_NAMES_SHORT = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];
  const MONTH_NAMES_FULL  = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];

  /* ---- Stats Calculation ---- */

  function _computeStats() {
    const now       = new Date();
    const curY      = now.getFullYear();
    const curM      = now.getMonth();
    const missions  = (typeof Missions.getVisibleMissions === 'function') ? Missions.getVisibleMissions() : Missions.getAll();
    const users     = Users.getAll();
    const isRegular = typeof Auth !== 'undefined' && Auth.isLoggedIn() && !Auth.isAdmin();
    const currentUser = (typeof Auth !== 'undefined') ? Auth.getCurrentUser() : null;

    const missionsMonth = missions.filter(m => {
      const d = new Date(m.dateDepart);
      return d.getFullYear() === curY && d.getMonth() === curM;
    }).length;

    const missionsYear = missions.filter(m => {
      return new Date(m.dateDepart).getFullYear() === curY;
    }).length;

    const joursYear = missions
      .filter(m => new Date(m.dateDepart).getFullYear() === curY)
      .reduce((s, m) => s + Missions.calcDays(m), 0);

    const totalAgentsVal = isRegular ? (currentUser?.matricule || 'Actif') : users.length;

    return { missionsMonth, missionsYear, totalAgents: totalAgentsVal, joursYear, isRegular };
  }

  /* ---- Render stat cards ---- */

  function _renderStatCards(stats) {
    _setText('dash-missions-month', stats.missionsMonth);
    _setText('dash-missions-year',  stats.missionsYear);
    _setText('dash-agents-total',   stats.totalAgents);
    _setText('dash-jours-total',    stats.joursYear);

    // Ajuster le libellé de la carte agent si personnel
    const labelAgent = document.querySelector('#dash-stat-cards .stat-card:nth-child(3) .stat-label');
    if (labelAgent) {
      labelAgent.textContent = stats.isRegular ? 'Mon Matricule' : 'Agents enregistrés';
    }
  }

  function _setText(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  }

  /* ---- Bar Chart: Missions per month (last 12 months) ---- */

  function drawBarChart() {
    const canvas = document.getElementById('chart-monthly');
    if (!canvas) return;

    const ctx  = canvas.getContext('2d');
    const now  = new Date();
    const labels = [];
    const data   = [];

    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      labels.push(MONTH_NAMES_SHORT[d.getMonth()] + ' ' + String(d.getFullYear()).slice(2));
      const count = (typeof Missions.getVisibleByMonth === 'function')
        ? Missions.getVisibleByMonth(d.getFullYear(), d.getMonth()).length
        : Missions.getByMonth(d.getFullYear(), d.getMonth()).length;
      data.push(count);
    }

    // Determine DPR for sharp rendering
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.parentElement.getBoundingClientRect();
    const W    = rect.width  || 500;
    const H    = 220;

    canvas.width  = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width  = W + 'px';
    canvas.style.height = H + 'px';
    ctx.scale(dpr, dpr);

    _drawBars(ctx, W, H, labels, data, '#2980b9', '#e67e22');
  }

  function _drawBars(ctx, W, H, labels, data, barColor, accentColor) {
    const PAD_L = 36, PAD_R = 12, PAD_T = 20, PAD_B = 38;
    const chartW = W - PAD_L - PAD_R;
    const chartH = H - PAD_T - PAD_B;
    const maxVal = Math.max(...data, 1);

    // Dark mode detection
    const isDark = document.body.classList.contains('dark-mode');
    const gridColor = isDark ? '#253650' : '#e9ecef';
    const textColor = isDark ? '#8097b0' : '#7f8c8d';
    const bgCard    = isDark ? '#1a2535' : '#fff';

    ctx.clearRect(0, 0, W, H);

    // Horizontal grid lines
    const steps = 4;
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 1;
    for (let i = 0; i <= steps; i++) {
      const y = PAD_T + chartH - (i / steps) * chartH;
      ctx.beginPath();
      ctx.moveTo(PAD_L, y);
      ctx.lineTo(PAD_L + chartW, y);
      ctx.stroke();

      // Y-axis labels
      ctx.fillStyle = textColor;
      ctx.font = '10px system-ui';
      ctx.textAlign = 'right';
      const val = Math.round((i / steps) * maxVal);
      ctx.fillText(val, PAD_L - 4, y + 3.5);
    }

    // Bars
    const barW    = (chartW / labels.length) * 0.55;
    const barGap  = chartW / labels.length;

    data.forEach((val, i) => {
      const x = PAD_L + i * barGap + (barGap - barW) / 2;
      const barH = (val / maxVal) * chartH;
      const y    = PAD_T + chartH - barH;

      // Gradient
      const grad = ctx.createLinearGradient(0, y, 0, PAD_T + chartH);
      grad.addColorStop(0, accentColor);
      grad.addColorStop(1, barColor);

      ctx.fillStyle = grad;
      ctx.beginPath();
      _roundRect(ctx, x, y, barW, barH, 4);
      ctx.fill();

      // Value label on top of bar
      if (val > 0) {
        ctx.fillStyle = isDark ? '#dce8f5' : '#1c2833';
        ctx.font = 'bold 10px system-ui';
        ctx.textAlign = 'center';
        ctx.fillText(val, x + barW / 2, y - 4);
      }

      // X label
      ctx.fillStyle = textColor;
      ctx.font = '9.5px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText(labels[i], x + barW / 2, PAD_T + chartH + 14);
    });
  }

  /* ---- Horizontal Bar Chart: Top 5 agents (Admin) OR Transport Modes (Personnel) ---- */

  function drawHorizontalBarChart() {
    const canvas = document.getElementById('chart-agents');
    if (!canvas) return;

    const ctx       = canvas.getContext('2d');
    const isRegular = typeof Auth !== 'undefined' && Auth.isLoggedIn() && !Auth.isAdmin();
    const titleEl   = document.getElementById('dash-chart-agents-title');

    let entries = [];

    if (isRegular) {
      if (titleEl) {
        titleEl.innerHTML = '<i class="fa-solid fa-car-side"></i> Mes moyens de transport';
      }
      const myMissions = (typeof Missions.getVisibleMissions === 'function')
        ? Missions.getVisibleMissions()
        : Missions.getAll();

      const counts = {
        'Véh. Service': 0,
        'Véh. Personnel': 0,
        'Covoiturage': 0,
        'Transport': 0
      };

      myMissions.forEach(m => {
        if (m.vehiculeService) counts['Véh. Service']++;
        if (m.vehiculePerso)   counts['Véh. Personnel']++;
        if (m.covoiturage)     counts['Covoiturage']++;
        if (m.transportCommun) counts['Transport']++;
      });

      entries = Object.keys(counts).map(k => ({
        label: k,
        full:  k,
        count: counts[k]
      }));
    } else {
      if (titleEl) {
        titleEl.innerHTML = '<i class="fa-solid fa-ranking-star"></i> Top 5 agents';
      }
      const missions = Missions.getAll();
      const users    = Users.getAll();

      // Count per user
      const counts = {};
      missions.forEach(m => {
        const uid = m.userId || (m.agent && m.agent.id) || 'unknown';
        counts[uid] = (counts[uid] || 0) + 1;
      });

      // Build labels
      entries = users.map(u => ({
        label: u.nom.split(' ').slice(-1)[0] || u.nom, // Last name
        full:  u.nom,
        count: counts[u.id] || 0
      })).sort((a, b) => b.count - a.count).slice(0, 5);
    }

    const dpr  = window.devicePixelRatio || 1;
    const rect = canvas.parentElement.getBoundingClientRect();
    const W    = rect.width || 260;
    const H    = 220;

    canvas.width  = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width  = W + 'px';
    canvas.style.height = H + 'px';
    ctx.scale(dpr, dpr);

    const isDark    = document.body.classList.contains('dark-mode');
    const textColor = isDark ? '#8097b0' : '#7f8c8d';
    const gridColor = isDark ? '#253650' : '#e9ecef';

    ctx.clearRect(0, 0, W, H);

    if (entries.length === 0) {
      ctx.fillStyle = textColor;
      ctx.font = '12px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('Aucune donnée', W / 2, H / 2);
      return;
    }

    const maxVal  = Math.max(...entries.map(e => e.count), 1);
    const PAD_L   = 85, PAD_R = 36, PAD_T = 14, PAD_B = 14;
    const chartW  = W - PAD_L - PAD_R;
    const rowH    = (H - PAD_T - PAD_B) / entries.length;
    const barH    = rowH * 0.48;

    const colors  = ['#2980b9','#27ae60','#e67e22','#9b59b6','#1abc9c'];

    entries.forEach((e, i) => {
      const y    = PAD_T + i * rowH + (rowH - barH) / 2;
      const barW = (e.count / maxVal) * chartW;

      // Agent or Transport name
      ctx.fillStyle = isDark ? '#dce8f5' : '#1c2833';
      ctx.font = '10px system-ui';
      ctx.textAlign = 'right';
      ctx.fillText(_truncate(e.label, 13), PAD_L - 6, y + barH / 2 + 4);

      // Grid line
      ctx.strokeStyle = gridColor;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(PAD_L, y + barH / 2);
      ctx.lineTo(PAD_L + chartW, y + barH / 2);
      ctx.stroke();

      // Bar
      if (barW > 0) {
        const grad = ctx.createLinearGradient(PAD_L, 0, PAD_L + barW, 0);
        grad.addColorStop(0, colors[i % colors.length]);
        grad.addColorStop(1, colors[i % colors.length] + 'bb');
        ctx.fillStyle = grad;
        ctx.beginPath();
        _roundRect(ctx, PAD_L, y, barW, barH, 4);
        ctx.fill();
      }

      // Count label
      ctx.fillStyle = isDark ? '#dce8f5' : '#1c2833';
      ctx.font = 'bold 10px system-ui';
      ctx.textAlign = 'left';
      ctx.fillText(e.count, PAD_L + barW + 5, y + barH / 2 + 4);
    });
  }

  function _truncate(str, len) {
    return str.length > len ? str.slice(0, len - 1) + '…' : str;
  }

  function _roundRect(ctx, x, y, w, h, r) {
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  /* ---- Recent missions table ---- */

  function renderRecentMissions() {
    const container = document.getElementById('dash-recent-missions');
    if (!container) return;

    const missions = ((typeof Missions.getVisibleMissions === 'function')
      ? Missions.getVisibleMissions()
      : Missions.getAll()).slice(0, 5);

    if (missions.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <i class="fa-solid fa-inbox"></i>
          <p>Aucune mission enregistrée</p>
        </div>`;
      return;
    }

    function transport(m) {
      if (m.vehiculeService) return '<span class="badge badge-blue">Veh. Service</span>';
      if (m.vehiculePerso)   return '<span class="badge badge-orange">Veh. Perso</span>';
      if (m.covoiturage)     return '<span class="badge badge-green">Covoiturage</span>';
      if (m.transportCommun) return '<span class="badge badge-gray">Transport commun</span>';
      return '<span class="badge badge-gray">–</span>';
    }

    function fmtDate(iso) {
      if (!iso) return '–';
      const [y, m, d] = iso.split('-');
      return `${d}/${m}/${y}`;
    }

    container.innerHTML = `
      <table class="data-table">
        <thead>
          <tr>
            <th>N° OM</th>
            <th>Agent</th>
            <th>Lieu</th>
            <th>Départ</th>
            <th>Retour</th>
            <th>Transport</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${missions.map(m => `
          <tr>
            <td><strong>${_esc(m.numero || '–')}</strong></td>
            <td>${_esc((m.agent && m.agent.nom) || '–')}</td>
            <td>${_esc(m.lieuDeplacement || '–')}</td>
            <td>${fmtDate(m.dateDepart)}</td>
            <td>${fmtDate(m.dateRetour)}</td>
            <td>${transport(m)}</td>
            <td>
              <button class="btn btn-outline btn-xs" onclick="PDF.showPreviewById('${m.id}')">
                <i class="fa-solid fa-eye"></i>
              </button>
              <button class="btn btn-primary btn-xs" onclick="PDF.exportPDFById('${m.id}')">
                <i class="fa-solid fa-file-pdf"></i>
              </button>
            </td>
          </tr>`).join('')}
        </tbody>
      </table>`;
  }

  function _esc(str) {
    return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  /* ---- Render all ---- */

  function render() {
    const stats = _computeStats();
    _renderStatCards(stats);
    renderRecentMissions();

    // Charts are drawn with rAF for layout stability
    requestAnimationFrame(() => {
      drawBarChart();
      drawHorizontalBarChart();
    });
  }

  /* ---- Init ---- */

  function init() {
    render();

    const refreshBtn = document.getElementById('dashboard-refresh');
    if (refreshBtn) refreshBtn.addEventListener('click', render);

    // Re-draw charts on window resize
    let resizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        if (document.getElementById('view-dashboard').classList.contains('active')) {
          drawBarChart();
          drawHorizontalBarChart();
        }
      }, 250);
    });
  }

  return { init, render, drawBarChart, drawHorizontalBarChart, renderRecentMissions };
})();
