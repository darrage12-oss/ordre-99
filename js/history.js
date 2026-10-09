/**
 * history.js
 * Manages the History view: month navigation, filter, CSV export
 */

const History = (() => {
  'use strict';

  // State
  let _currentYear  = new Date().getFullYear();
  let _currentMonth = new Date().getMonth(); // 0-indexed

  const MONTH_NAMES = [
    'Janvier','Février','Mars','Avril','Mai','Juin',
    'Juillet','Août','Septembre','Octobre','Novembre','Décembre'
  ];

  /* ---- Transport label ---- */
  function _transportBadges(m) {
    const badges = [];
    if (m.covoiturage)     badges.push('Covoiturage');
    if (m.vehiculeService) badges.push('Véhicule service' + (m.vehiculeServiceNum ? ` (${m.vehiculeServiceNum})` : ''));
    if (m.transportCommun) badges.push('Transport commun');
    if (m.vehiculePerso)   badges.push('Véhicule perso' + (m.vehiculePersoMarque ? ` – ${m.vehiculePersoMarque}` : ''));
    return badges;
  }

  function _esc(str) {
    return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function _formatDate(iso) {
    if (!iso) return '–';
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
  }

  function _calcDays(m) {
    return Missions.calcDays(m);
  }

  /* ---- Populate agent filter dropdown ---- */

  function populateAgentFilter() {
    const sel = document.getElementById('hist-filter-agent');
    if (!sel) return;

    // Si utilisateur normal (non-admin), masquer complètement le filtre pour garantir la confidentialité
    if (typeof Auth !== 'undefined' && Auth.isLoggedIn() && !Auth.isAdmin()) {
      if (sel.parentElement) sel.parentElement.style.display = 'none';
      return;
    }

    if (sel.parentElement) sel.parentElement.style.display = 'flex';

    const current = sel.value;
    sel.innerHTML = '<option value="">Tous les matricules</option>';

    Users.getAll().forEach(u => {
      if (u.matricule === 'ADMIN') return;
      const opt = document.createElement('option');
      opt.value = u.id;
      opt.textContent = u.matricule || u.nom;
      if (u.id === current) opt.selected = true;
      sel.appendChild(opt);
    });
  }

  /* ---- Render the history view ---- */

  function render() {
    const grid     = document.getElementById('history-grid');
    const label    = document.getElementById('hist-month-label');
    const countEl  = document.getElementById('hist-count');
    const daysEl   = document.getElementById('hist-days');

    if (!grid) return;

    if (label) {
      label.textContent = `${MONTH_NAMES[_currentMonth]} ${_currentYear}`;
    }

    // Get missions for current month
    let missions = Missions.getByMonth(_currentYear, _currentMonth);

    // Apply agent filter
    const filterSel = document.getElementById('hist-filter-agent');
    const filterVal = filterSel ? filterSel.value : '';
    if (filterVal) {
      missions = missions.filter(m => m.userId === filterVal || (m.agent && m.agent.id === filterVal));
    }

    // Stats
    const totalDays = missions.reduce((sum, m) => sum + _calcDays(m), 0);
    if (countEl) countEl.textContent = missions.length;
    if (daysEl)  daysEl.textContent  = totalDays;

    // Render cards
    if (missions.length === 0) {
      grid.innerHTML = `
        <div class="empty-state" style="grid-column:1/-1">
          <i class="fa-solid fa-calendar-xmark"></i>
          <p>Aucune mission pour ${MONTH_NAMES[_currentMonth]} ${_currentYear}</p>
          <small>Changez de mois ou créez une nouvelle mission</small>
        </div>`;
      return;
    }

    grid.innerHTML = missions.map(m => {
      const badges = _transportBadges(m);
      const days   = _calcDays(m);
      const agent  = m.agent || {};

      return `
      <div class="mission-card">
        <div class="mission-card-header">
          <span class="mc-num">${_esc(m.numero || '–')}</span>
          <span class="mc-agent" style="font-weight:700;color:var(--primary)"><i class="fa-solid fa-id-card"></i> ${_esc(agent.matricule || agent.nom || '–')}</span>
        </div>
        <div class="mission-card-body">
          <div class="mc-row">
            <i class="fa-solid fa-user"></i>
            <span class="mc-label">Agent :</span>
            <span>${_esc(agent.nom || '–')}</span>
          </div>
          <div class="mc-row">
            <i class="fa-solid fa-map-marker-alt"></i>
            <span class="mc-label">Lieu :</span>
            <span>${_esc(m.lieuDeplacement)}</span>
          </div>
          <div class="mc-row">
            <i class="fa-solid fa-align-left"></i>
            <span class="mc-label">Motif :</span>
            <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:200px" title="${_esc(m.motifDeplacement)}">${_esc(m.motifDeplacement)}</span>
          </div>
          <div class="mc-row">
            <i class="fa-solid fa-calendar-days"></i>
            <span class="mc-label">Dates :</span>
            <span>${_formatDate(m.dateDepart)} → ${_formatDate(m.dateRetour)}</span>
            <span class="badge badge-blue" style="margin-left:6px">${days} j.</span>
          </div>
          ${badges.length > 0 ? `
          <div class="mc-transport-badges">
            ${badges.map(b => `<span class="mc-transport-badge">${_esc(b)}</span>`).join('')}
          </div>` : ''}
        </div>
        <div class="mission-card-actions">
          <button class="btn btn-outline btn-xs" onclick="PDF.showPreviewById('${m.id}')" title="Aperçu">
            <i class="fa-solid fa-eye"></i>
          </button>
          <button class="btn btn-primary btn-xs" onclick="PDF.exportPDFById('${m.id}')" title="Exporter PDF">
            <i class="fa-solid fa-file-pdf"></i> PDF
          </button>
          <button class="btn btn-secondary btn-xs" onclick="Missions.edit('${m.id}')" title="Modifier">
            <i class="fa-solid fa-pen"></i> Modifier
          </button>
          <button class="btn btn-danger btn-xs" onclick="Missions.confirmDelete('${m.id}')" title="Supprimer">
            <i class="fa-solid fa-trash-can"></i>
          </button>
        </div>
      </div>`;
    }).join('');
  }

  /* ---- Navigation ---- */

  function prevMonth() {
    _currentMonth--;
    if (_currentMonth < 0) {
      _currentMonth = 11;
      _currentYear--;
    }
    render();
  }

  function nextMonth() {
    _currentMonth++;
    if (_currentMonth > 11) {
      _currentMonth = 0;
      _currentYear++;
    }
    render();
  }

  /* ---- Export CSV ---- */

  function exportCSV() {
    let missions = Missions.getByMonth(_currentYear, _currentMonth);

    const filterSel = document.getElementById('hist-filter-agent');
    const filterVal = filterSel ? filterSel.value : '';
    if (filterVal) {
      missions = missions.filter(m => m.userId === filterVal || (m.agent && m.agent.id === filterVal));
    }

    if (missions.length === 0) {
      App.showToast('Aucune donnée', 'Aucune mission à exporter pour cette période.', 'warning');
      return;
    }

    const headers = [
      'N° OM','Nom Agent','Matricule','Fonction','Direction',
      'Lieu Déplacement','Motif','Date Départ','Heure Départ',
      'Date Retour','Heure Retour','Transport','Kilométrage',
      'Date Création','Lieu Création'
    ];

    function csvEsc(val) {
      const s = String(val || '');
      if (s.includes(',') || s.includes('"') || s.includes('\n')) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    }

    function transportStr(m) {
      const t = [];
      if (m.covoiturage)     t.push('Covoiturage');
      if (m.vehiculeService) t.push(`Veh.Service(${m.vehiculeServiceNum || ''})`);
      if (m.transportCommun) t.push('Transport commun');
      if (m.vehiculePerso)   t.push(`Veh.Perso(${m.vehiculePersoMarque || ''}/${m.puissanceFiscale || ''}cv)`);
      return t.join(' | ');
    }

    const rows = missions.map(m => [
      m.numero || '',
      (m.agent && m.agent.nom) || '',
      (m.agent && m.agent.matricule) || '',
      (m.agent && m.agent.fonction) || '',
      (m.agent && m.agent.direction) || '',
      m.lieuDeplacement || '',
      m.motifDeplacement || '',
      m.dateDepart || '',
      m.heureDepart || '',
      m.dateRetour || '',
      m.heureRetour || '',
      transportStr(m),
      m.kilometrage || '',
      m.dateCreation || '',
      m.lieuCreation || ''
    ].map(csvEsc).join(','));

    const csvContent = '\uFEFF' + [headers.map(csvEsc).join(','), ...rows].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `ordres-mission-${MONTH_NAMES[_currentMonth]}-${_currentYear}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    App.showToast('Export CSV', `${missions.length} missions exportées.`, 'success');
  }

  /* ---- Init ---- */

  function init() {
    // Month navigation buttons
    const prevBtn = document.getElementById('hist-prev-month');
    const nextBtn = document.getElementById('hist-next-month');
    if (prevBtn) prevBtn.addEventListener('click', prevMonth);
    if (nextBtn) nextBtn.addEventListener('click', nextMonth);

    // Export CSV button
    const csvBtn = document.getElementById('btn-export-csv');
    if (csvBtn) csvBtn.addEventListener('click', exportCSV);

    // Agent filter
    const filterSel = document.getElementById('hist-filter-agent');
    if (filterSel) filterSel.addEventListener('change', render);

    populateAgentFilter();
    render();
  }

  return {
    init,
    render,
    prevMonth,
    nextMonth,
    exportCSV,
    populateAgentFilter
  };
})();
