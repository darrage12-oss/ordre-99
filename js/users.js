/**
 * users.js
 * Manages agent/user CRUD operations
 */

const Users = (() => {
  'use strict';

  const STORAGE_KEY       = 'ordre_mission_users';
  const ACTIVE_USER_KEY   = 'ordre_mission_active_user';

  /* ---- Private helpers ---- */

  function _load() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    } catch { return []; }
  }

  function _save(users) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(users));
  }

  function _uid() {
    return 'u' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  function _initials(nom) {
    return nom.trim().split(/\s+/).slice(0, 2).map(w => w[0] || '').join('').toUpperCase() || '?';
  }

  /* ---- Public API ---- */

  function getAll() {
    return _load();
  }

  function getById(id) {
    return _load().find(u => u.id === id) || null;
  }

  function save(data) {
    const users = _load();
    if (data.id) {
      // Update
      const idx = users.findIndex(u => u.id === data.id);
      if (idx !== -1) {
        users[idx] = { ...users[idx], ...data };
      }
    } else {
      // Create
      data.id = _uid();
      users.push(data);
    }
    _save(users);
    if (typeof CloudSync !== 'undefined') CloudSync.onLocalChange();
    return data;
  }

  function remove(id) {
    const users = _load().filter(u => u.id !== id);
    _save(users);
    if (typeof CloudSync !== 'undefined') CloudSync.onLocalChange();
    // Clear active user if deleted
    if (getActiveUserId() === id) {
      localStorage.removeItem(ACTIVE_USER_KEY);
    }
  }

  function getActiveUserId() {
    return localStorage.getItem(ACTIVE_USER_KEY) || '';
  }

  function setActiveUser(id) {
    localStorage.setItem(ACTIVE_USER_KEY, id);
  }

  function getActiveUser() {
    const id = getActiveUserId();
    if (!id) return null;
    return getById(id);
  }

  /* ---- UI: Populate dropdown ---- */

  function populateDropdown(selectEl) {
    if (!selectEl) return;
    const users = getAll();
    const activeId = getActiveUserId();

    selectEl.innerHTML = '<option value="">— Choisir par Matricule —</option>';
    users.forEach(u => {
      const opt = document.createElement('option');
      opt.value = u.id;
      // Affichage du Matricule uniquement comme identifiant principal
      opt.textContent = u.matricule || u.nom;
      if (u.id === activeId) opt.selected = true;
      selectEl.appendChild(opt);
    });
  }

  /* ---- UI: Render agent cards grid ---- */

  function renderList() {
    const grid = document.getElementById('agents-grid');
    if (!grid) return;

    const users = getAll();

    if (users.length === 0) {
      grid.innerHTML = `
        <div class="empty-state" style="grid-column:1/-1">
          <i class="fa-solid fa-users-slash"></i>
          <p>Aucun agent enregistré</p>
          <small>Cliquez sur "Ajouter un agent" pour commencer</small>
        </div>`;
      return;
    }

    grid.innerHTML = users.map(u => `
      <div class="agent-card">
        <div class="agent-card-header">
          <div class="agent-avatar">${_initials(u.nom)}</div>
          <div class="agent-matricule" style="font-size:1.15rem;font-weight:700;color:var(--primary);letter-spacing:0.5px;margin-bottom:2px">Matricule : ${_esc(u.matricule || '–')}</div>
          <div class="agent-name" style="font-size:0.92rem;color:var(--text-muted)">${_esc(u.nom)}</div>
        </div>
        <div class="agent-card-body">
          <div class="agent-info-row">
            <i class="fa-solid fa-briefcase"></i>
            <span class="ai-label">Fonction :</span>
            <span>${_esc(u.fonction || '–')}</span>
          </div>
          <div class="agent-info-row">
            <i class="fa-solid fa-building"></i>
            <span class="ai-label">Direction :</span>
            <span>${_esc(u.direction || '–')}</span>
          </div>
          <div class="agent-info-row">
            <i class="fa-solid fa-sitemap"></i>
            <span class="ai-label">Département :</span>
            <span>${_esc(u.departement || '–')}</span>
          </div>
          <div class="agent-info-row">
            <i class="fa-solid fa-network-wired"></i>
            <span class="ai-label">Division :</span>
            <span>${_esc(u.division || '–')}</span>
          </div>
          ${u.service ? `
          <div class="agent-info-row">
            <i class="fa-solid fa-layer-group"></i>
            <span class="ai-label">Service :</span>
            <span>${_esc(u.service)}</span>
          </div>` : ''}
          <div class="agent-info-row">
            <i class="fa-solid fa-map-pin"></i>
            <span class="ai-label">Province :</span>
            <span>${_esc(u.province || '–')}</span>
          </div>
        </div>
        <div class="agent-card-actions">
          <button class="btn btn-outline btn-sm" onclick="Users.openModal('${u.id}')">
            <i class="fa-solid fa-pen"></i> Modifier
          </button>
          <button class="btn btn-danger btn-sm" onclick="Users.confirmDelete('${u.id}')">
            <i class="fa-solid fa-trash-can"></i> Supprimer
          </button>
        </div>
      </div>`).join('');
  }

  /* ---- UI: Open modal (add or edit) ---- */

  function openModal(userId) {
    const modal = document.getElementById('agent-modal');
    const form  = document.getElementById('agent-form');
    const title = document.getElementById('agent-modal-title');

    // Reset form
    form.reset();
    document.getElementById('af-edit-id').value = '';

    if (userId) {
      const u = getById(userId);
      if (!u) return;
      title.textContent = 'Modifier l\'agent';
      document.getElementById('af-edit-id').value     = u.id;
      document.getElementById('af-nom').value          = u.nom || '';
      document.getElementById('af-matricule').value    = u.matricule || '';
      document.getElementById('af-fonction').value     = u.fonction || '';
      document.getElementById('af-direction').value    = u.direction || '';
      document.getElementById('af-departement').value  = u.departement || '';
      document.getElementById('af-division').value     = u.division || '';
      document.getElementById('af-service').value      = u.service || '';
      document.getElementById('af-province').value     = u.province || '';
    } else {
      title.textContent = 'Ajouter un agent';
    }

    App.openModal('agent-modal');
  }

  /* ---- UI: Save from form ---- */

  function saveFromForm() {
    const nom = document.getElementById('af-nom').value.trim();
    const mat = document.getElementById('af-matricule').value.trim();

    if (!nom) {
      App.showToast('Champ requis', 'Le nom de l\'agent est obligatoire.', 'error');
      return;
    }

    const data = {
      id:          document.getElementById('af-edit-id').value || null,
      nom:         nom,
      matricule:   mat,
      fonction:    document.getElementById('af-fonction').value.trim(),
      direction:   document.getElementById('af-direction').value.trim(),
      departement: document.getElementById('af-departement').value.trim(),
      division:    document.getElementById('af-division').value.trim(),
      service:     document.getElementById('af-service').value.trim(),
      province:    document.getElementById('af-province').value.trim()
    };

    save(data);
    App.closeModal('agent-modal');
    renderList();
    populateDropdown(document.getElementById('active-agent-select'));
    // Also update history filter
    History.populateAgentFilter();
    App.showToast('Agent enregistré', `${nom} a été enregistré.`, 'success');
  }

  /* ---- Confirm delete ---- */

  function confirmDelete(id) {
    const u = getById(id);
    if (!u) return;

    App.showConfirm(
      `Supprimer l'agent <strong>${_esc(u.nom)}</strong> ? Cette action est irréversible.`,
      () => {
        remove(id);
        renderList();
        populateDropdown(document.getElementById('active-agent-select'));
        History.populateAgentFilter();
        App.showToast('Agent supprimé', `${u.nom} a été supprimé.`, 'warning');
      }
    );
  }

  /* ---- Fill mission form with active user ---- */

  function fillMissionForm() {
    const u = getActiveUser();
    const noWarn = document.getElementById('no-agent-warning');

    if (!u) {
      // Clear fields
      ['f-nom','f-matricule','f-fonction','f-direction','f-departement',
       'f-division','f-service','f-province','f-lieu-creation'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
      });
      if (noWarn) noWarn.classList.remove('hidden');
      return;
    }

    if (noWarn) noWarn.classList.add('hidden');

    _setVal('f-nom',         u.nom);
    _setVal('f-matricule',   u.matricule);
    _setVal('f-fonction',    u.fonction);
    _setVal('f-direction',   u.direction);
    _setVal('f-departement', u.departement);
    _setVal('f-division',    u.division);
    _setVal('f-service',     u.service);
    _setVal('f-province',    u.province);

    // Auto-fill lieu creation from province
    const lieuEl = document.getElementById('f-lieu-creation');
    if (lieuEl && !lieuEl.value) {
      lieuEl.value = u.province || '';
    }
  }

  function _setVal(id, val) {
    const el = document.getElementById(id);
    if (el) el.value = val || '';
  }

  function _esc(str) {
    return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  /* ---- Init ---- */

  function init() {
    renderList();
    populateDropdown(document.getElementById('active-agent-select'));

    // Add agent button
    const addBtn = document.getElementById('btn-add-agent');
    if (addBtn) addBtn.addEventListener('click', () => openModal());

    // Save agent button
    const saveBtn = document.getElementById('btn-save-agent');
    if (saveBtn) saveBtn.addEventListener('click', saveFromForm);

    // Active agent select change
    const sel = document.getElementById('active-agent-select');
    if (sel) {
      sel.addEventListener('change', function() {
        setActiveUser(this.value);
        Users.fillMissionForm();
        // Refresh form numero if on create view
        Missions.refreshFormHeader();
      });
    }
  }

  return {
    init,
    getAll,
    getById,
    save,
    remove,
    getActiveUser,
    getActiveUserId,
    setActiveUser,
    populateDropdown,
    renderList,
    openModal,
    saveFromForm,
    confirmDelete,
    fillMissionForm
  };
})();
