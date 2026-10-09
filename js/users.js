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
    if (typeof CloudSync !== 'undefined') {
      if (typeof CloudSync.onUserSaved === 'function') {
        CloudSync.onUserSaved(data);
      } else if (typeof CloudSync.onLocalChange === 'function') {
        CloudSync.onLocalChange();
      }
    }
    return data;
  }

  function remove(id) {
    const users = _load().filter(u => u.id !== id);
    _save(users);
    if (typeof CloudSync !== 'undefined') {
      if (typeof CloudSync.onUserDeleted === 'function') {
        CloudSync.onUserDeleted(id);
      } else if (typeof CloudSync.onLocalChange === 'function') {
        CloudSync.onLocalChange();
      }
    }
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

    const users   = getAll();
    const isAdmin = typeof Auth !== 'undefined' ? Auth.isAdmin() : true;
    const curUser = typeof Auth !== 'undefined' ? Auth.getCurrentUser() : null;

    // Masquer le bouton d'ajout si simple agent
    const addBtn = document.getElementById('btn-add-agent');
    if (addBtn) addBtn.style.display = isAdmin ? 'inline-flex' : 'none';

    // Filtrer : les agents simples ne voient que leur propre fiche
    const displayUsers = (!isAdmin && curUser) ? users.filter(u => u.id === curUser.id) : users;

    if (displayUsers.length === 0) {
      grid.innerHTML = `
        <div class="empty-state" style="grid-column:1/-1">
          <i class="fa-solid fa-users-slash"></i>
          <p>Aucun profil enregistré</p>
          ${isAdmin ? '<small>Cliquez sur "Ajouter un agent" pour commencer</small>' : ''}
        </div>`;
      return;
    }

    grid.innerHTML = displayUsers.map(u => `
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

          <!-- Section Sécurité & Mot de passe (Visible pour Admin et sur son propre profil) -->
          <div class="agent-security-box" style="margin-top:12px;padding:10px 12px;background:rgba(41,128,185,0.06);border:1px solid rgba(41,128,185,0.22);border-radius:8px;">
            <div style="font-size:0.75rem;font-weight:700;color:var(--primary);margin-bottom:6px;display:flex;align-items:center;justify-content:space-between;">
              <span><i class="fa-solid fa-shield-halved"></i> Accès & Sécurité</span>
              <span class="badge ${u.role === 'admin' ? 'badge-orange' : 'badge-blue'}" style="font-size:0.68rem;">${u.role === 'admin' ? 'Administrateur' : 'Personnel'}</span>
            </div>
            <div class="agent-info-row" style="margin-bottom:5px;">
              <i class="fa-solid fa-envelope" style="color:#e74c3c;"></i>
              <span class="ai-label">Gmail :</span>
              <span style="font-weight:600;color:var(--text);word-break:break-all;">${_esc(u.email || 'Non renseigné')}</span>
            </div>
            <div class="agent-info-row" style="align-items:center;">
              <i class="fa-solid fa-key" style="color:#f39c12;"></i>
              <span class="ai-label">Mot de passe :</span>
              <span class="agent-pass-box" style="display:inline-flex;align-items:center;gap:6px;">
                <code id="pass-text-${u.id}" style="background:var(--bg-table-odd);padding:2px 8px;border-radius:4px;font-size:0.9rem;letter-spacing:1px;font-weight:700;color:var(--primary);">••••••••</code>
                <button type="button" class="btn btn-xs btn-outline" style="padding:2px 7px;" onclick="Users.toggleCardPass('${u.id}', '${_esc(u.password || '1234')}')" title="Afficher/Masquer">
                  <i class="fa-solid fa-eye" id="pass-eye-${u.id}"></i>
                </button>
              </span>
            </div>
          </div>
        </div>
        <div class="agent-card-actions">
          <button class="btn btn-primary btn-sm" onclick="Users.openModal('${u.id}')" title="Modifier l'agent, son mot de passe ou son Gmail">
            <i class="fa-solid fa-pen-to-square"></i> Modifier (MDP / Gmail)
          </button>
          ${(isAdmin && String(u.matricule).toUpperCase() !== 'ADMIN') ? `
          <button class="btn btn-danger btn-sm" onclick="Users.confirmDelete('${u.id}')" title="Supprimer cet agent">
            <i class="fa-solid fa-trash-can"></i> Supprimer
          </button>` : ''}
        </div>
      </div>`).join('');
  }

  /* ---- UI: Open modal (add or edit) ---- */

  function openModal(userId) {
    const modal = document.getElementById('agent-modal');
    const form  = document.getElementById('agent-form');
    const title = document.getElementById('agent-modal-title');
    const isAdmin = typeof Auth !== 'undefined' ? Auth.isAdmin() : true;

    // Reset form
    form.reset();
    document.getElementById('af-edit-id').value = '';

    // Gestion du rôle : les simples agents ne peuvent pas changer leur rôle
    const roleWrap = document.getElementById('af-role-wrap');
    if (roleWrap) roleWrap.style.display = isAdmin ? 'block' : 'none';

    if (userId) {
      const u = getById(userId);
      if (!u) return;
      title.textContent = 'Modifier l\'agent (Infos, Mot de passe, Gmail)';
      document.getElementById('af-edit-id').value     = u.id;
      document.getElementById('af-nom').value          = u.nom || '';
      document.getElementById('af-matricule').value    = u.matricule || '';
      document.getElementById('af-fonction').value     = u.fonction || '';
      document.getElementById('af-direction').value    = u.direction || '';
      document.getElementById('af-departement').value  = u.departement || '';
      document.getElementById('af-division').value     = u.division || '';
      document.getElementById('af-service').value      = u.service || '';
      document.getElementById('af-province').value     = u.province || '';
      document.getElementById('af-email').value        = u.email || '';
      document.getElementById('af-password').value     = u.password || '1234';
      document.getElementById('af-role').value         = u.role || 'agent';
    } else {
      title.textContent = 'Ajouter un agent (Avec accès sécurisé)';
      document.getElementById('af-email').value        = '';
      document.getElementById('af-password').value     = '1234';
      document.getElementById('af-role').value         = 'agent';
    }

    App.openModal('agent-modal');
  }

  /* ---- UI: Save from form ---- */

  function saveFromForm() {
    const nom   = document.getElementById('af-nom').value.trim();
    const mat   = document.getElementById('af-matricule').value.trim();
    const email = document.getElementById('af-email').value.trim();
    const pass  = document.getElementById('af-password').value.trim();
    const role  = document.getElementById('af-role').value || 'agent';

    if (!nom) {
      App.showToast('Champ requis', 'Le nom de l\'agent est obligatoire.', 'error');
      return;
    }
    if (!mat) {
      App.showToast('Champ requis', 'Le matricule de l\'agent est obligatoire.', 'error');
      return;
    }
    if (!email) {
      App.showToast('Champ requis', 'L\'email Gmail de récupération est obligatoire.', 'error');
      return;
    }
    if (!pass || pass.length < 4) {
      App.showToast('Mot de passe invalide', 'Le mot de passe doit comporter au moins 4 caractères.', 'error');
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
      province:    document.getElementById('af-province').value.trim(),
      email:       email,
      password:    pass,
      role:        role
    };

    save(data);

    // Si on a modifié la session actuelle, mettre à jour la session
    if (typeof Auth !== 'undefined') {
      const curUser = Auth.getCurrentUser();
      if (curUser && curUser.id === data.id) {
        localStorage.setItem('ordre_mission_current_session', JSON.stringify(data));
        Auth.updateUIForSession();
      }
    }

    App.closeModal('agent-modal');
    renderList();
    populateDropdown(document.getElementById('active-agent-select'));
    // Also update history filter
    History.populateAgentFilter();
    App.showToast('Agent enregistré', `${nom} (MDP & Gmail sauvegardés).`, 'success');
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

  /* ---- Helpers pour affichage/masquage mot de passe ---- */

  function togglePassVisibility(inputId) {
    const el = document.getElementById(inputId);
    const eye = document.getElementById('af-pass-eye');
    if (!el) return;
    if (el.type === 'password') {
      el.type = 'text';
      if (eye) eye.className = 'fa-solid fa-eye-slash';
    } else {
      el.type = 'password';
      if (eye) eye.className = 'fa-solid fa-eye';
    }
  }

  function toggleCardPass(userId, clearPass) {
    const textEl = document.getElementById(`pass-text-${userId}`);
    const eyeEl  = document.getElementById(`pass-eye-${userId}`);
    if (!textEl) return;
    if (textEl.textContent === '••••••••') {
      textEl.textContent = clearPass;
      if (eyeEl) eyeEl.className = 'fa-solid fa-eye-slash';
    } else {
      textEl.textContent = '••••••••';
      if (eyeEl) eyeEl.className = 'fa-solid fa-eye';
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
    fillMissionForm,
    togglePassVisibility,
    toggleCardPass
  };
})();
