/**
 * missions.js
 * Manages mission CRUD and form logic
 */

const Missions = (() => {
  'use strict';

  const STORAGE_KEY = 'ordre_mission_missions';

  /* ---- Private helpers ---- */

  function _load() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    } catch { return []; }
  }

  function _save(missions) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(missions));
  }

  function _uid() {
    return 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  /* ---- Number generation ---- */

  function generateNumber(year) {
    const y = year || new Date().getFullYear();
    const key = `ordre_mission_counter_${y}`;
    const current = parseInt(localStorage.getItem(key) || '0', 10);
    const next = current + 1;
    localStorage.setItem(key, String(next));
    return `OM-${y}-${String(next).padStart(4, '0')}`;
  }

  function peekNextNumber(year) {
    const y = year || new Date().getFullYear();
    const key = `ordre_mission_counter_${y}`;
    const current = parseInt(localStorage.getItem(key) || '0', 10);
    return `OM-${y}-${String(current + 1).padStart(4, '0')}`;
  }

  /* ---- CRUD ---- */

  function getAll() {
    return _load().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  function getById(id) {
    return _load().find(m => m.id === id) || null;
  }

  /* ---- Confidentialité : filtrage des missions selon l'agent connecté ---- */
  function getVisibleMissions() {
    const all = getAll();
    if (typeof Auth === 'undefined' || !Auth.isLoggedIn()) return all;
    if (Auth.isAdmin()) return all;

    const user = Auth.getCurrentUser();
    if (!user) return all;

    const uMat = (user.matricule || '').toUpperCase().replace(/\s+/g, '');
    return all.filter(m => {
      if (m.userId === user.id) return true;
      const mMat = (m.agent?.matricule || '').toUpperCase().replace(/\s+/g, '');
      return mMat && mMat === uMat;
    });
  }

  function getVisibleByMonth(year, month) {
    // month: 0-indexed
    const visible = getVisibleMissions();
    return visible.filter(m => {
      const d = new Date(m.dateDepart);
      return d.getFullYear() === year && d.getMonth() === month;
    }).sort((a, b) => new Date(a.dateDepart) - new Date(b.dateDepart));
  }

  function getByMonth(year, month) {
    // Alias vers getVisibleByMonth pour assurer la confidentialité
    return getVisibleByMonth(year, month);
  }

  function save(data) {
    const missions = _load();
    data.updatedAt = new Date().toISOString();
    if (!data.createdAt) data.createdAt = data.updatedAt;
    if (data.id) {
      const idx = missions.findIndex(m => m.id === data.id);
      if (idx !== -1) {
        missions[idx] = { ...missions[idx], ...data };
      } else {
        missions.push(data);
      }
    } else {
      data.id = _uid();
      missions.push(data);
    }
    _save(missions);
    if (typeof CloudSync !== 'undefined') {
      if (typeof CloudSync.onMissionSaved === 'function') {
        CloudSync.onMissionSaved(data);
      } else if (typeof CloudSync.onLocalChange === 'function') {
        CloudSync.onLocalChange();
      }
    }
    return data;
  }

  function remove(id) {
    _save(_load().filter(m => m.id !== id));
    if (typeof CloudSync !== 'undefined') {
      if (typeof CloudSync.onMissionDeleted === 'function') {
        CloudSync.onMissionDeleted(id);
      } else if (typeof CloudSync.onLocalChange === 'function') {
        CloudSync.onLocalChange();
      }
    }
  }

  /* ---- Calculate mission days ---- */

  function calcDays(mission) {
    if (!mission.dateDepart || !mission.dateRetour) return 0;
    const d1 = new Date(mission.dateDepart);
    const d2 = new Date(mission.dateRetour);
    const diff = Math.ceil((d2 - d1) / (1000 * 60 * 60 * 24)) + 1;
    return Math.max(diff, 1);
  }

  /* ---- Form: collect data ---- */

  function _collectForm() {
    const activeUser = Users.getActiveUser();
    if (!activeUser) {
      App.showToast('Aucun agent', 'Veuillez sélectionner un agent actif.', 'error');
      return null;
    }

    const lieuVal = document.getElementById('f-lieu').value.trim();
    const motifVal = document.getElementById('f-motif').value.trim();
    const dateDepVal = document.getElementById('f-date-depart').value;
    const dateRetVal = document.getElementById('f-date-retour').value;

    if (!lieuVal) {
      App.showToast('Champ requis', 'Veuillez renseigner le lieu de déplacement.', 'error');
      return null;
    }
    if (!motifVal) {
      App.showToast('Champ requis', 'Veuillez renseigner le motif du déplacement.', 'error');
      return null;
    }
    if (!dateDepVal) {
      App.showToast('Champ requis', 'Veuillez renseigner la date de départ.', 'error');
      return null;
    }
    if (!dateRetVal) {
      App.showToast('Champ requis', 'Veuillez renseigner la date de retour.', 'error');
      return null;
    }
    if (new Date(dateRetVal) < new Date(dateDepVal)) {
      App.showToast('Dates invalides', 'La date de retour doit être après ou égale à la date de départ.', 'error');
      return null;
    }

    const vehService = document.getElementById('f-vehicule-service').checked;
    const vehPerso   = document.getElementById('f-vehicule-perso').checked;

    const editId = document.getElementById('f-edit-id').value;

    const data = {
      id:                editId || null,
      userId:            activeUser.id,
      agent:             { ...activeUser },
      lieuDeplacement:   lieuVal,
      motifDeplacement:  motifVal,
      dateDepart:        dateDepVal,
      heureDepart:       document.getElementById('f-heure-depart').value,
      dateRetour:        dateRetVal,
      heureRetour:       document.getElementById('f-heure-retour').value,
      covoiturage:       document.getElementById('f-covoiturage').checked,
      vehiculeService:   vehService,
      vehiculeServiceNum: vehService ? document.getElementById('f-vehicule-service-num').value.trim() : '',
      transportCommun:   document.getElementById('f-transport-commun').checked,
      vehiculePerso:     vehPerso,
      vehiculePersoMarque: vehPerso ? document.getElementById('f-vehicule-perso-marque').value.trim() : '',
      puissanceFiscale:  vehPerso ? document.getElementById('f-vehicule-perso-pf').value.trim() : '',
      kilometrage:       (vehService || vehPerso) ? document.getElementById('f-kilometrage').value.trim() : '',
      lieuCreation:      document.getElementById('f-lieu-creation').value.trim(),
      dateCreation:      document.getElementById('f-date-creation').value,
      createdAt:         new Date().toISOString()
    };

    // Assign numero
    if (!editId) {
      data.numero = generateNumber(new Date(dateDepVal).getFullYear());
    } else {
      // keep existing numero
      const existing = getById(editId);
      data.numero = existing ? existing.numero : generateNumber();
    }

    return data;
  }

  /* ---- Form: save mission ---- */

  function saveFromForm(e) {
    if (e) e.preventDefault();
    const data = _collectForm();
    if (!data) return;

    save(data);

    const isEdit = !!document.getElementById('f-edit-id').value;
    App.showToast(
      isEdit ? 'Mission modifiée' : 'Mission créée',
      `${data.numero} enregistré.`,
      'success'
    );

    resetForm();
    Dashboard.render();
    History.render();
    App.switchView('history');
  }

  /* ---- Form: preview ---- */

  function previewFromForm() {
    const data = _collectForm();
    if (!data) return;
    PDF.showPreview(data);
  }

  /* ---- Form: reset ---- */

  function resetForm() {
    // Keep agent info
    document.getElementById('f-edit-id').value = '';

    ['f-lieu','f-motif','f-heure-depart','f-heure-retour',
     'f-date-depart','f-date-retour'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });

    // Uncheck all transport
    ['f-covoiturage','f-vehicule-service','f-transport-commun','f-vehicule-perso'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.checked = false;
    });

    ['f-vehicule-service-num','f-vehicule-perso-marque','f-vehicule-perso-pf','f-kilometrage'].forEach(id => {
      const el = document.getElementById(id);
      if (el) { el.value = ''; el.disabled = true; }
    });

    document.getElementById('km-row').classList.add('hidden');

    // Reset date
    const today = new Date().toISOString().slice(0, 10);
    const dcEl = document.getElementById('f-date-creation');
    if (dcEl) dcEl.value = today;

    refreshFormHeader();
  }

  /* ---- Form: edit mission ---- */

  function edit(id) {
    const m = getById(id);
    if (!m) return;

    // Switch to create view
    App.switchView('create');

    // Set active user matching the mission agent
    Users.setActiveUser(m.userId);
    Users.populateDropdown(document.getElementById('active-agent-select'));
    Users.fillMissionForm();

    // Fill mission fields
    document.getElementById('f-edit-id').value        = m.id;
    document.getElementById('f-lieu').value            = m.lieuDeplacement || '';
    document.getElementById('f-motif').value           = m.motifDeplacement || '';
    document.getElementById('f-date-depart').value     = m.dateDepart || '';
    document.getElementById('f-heure-depart').value    = m.heureDepart || '';
    document.getElementById('f-date-retour').value     = m.dateRetour || '';
    document.getElementById('f-heure-retour').value    = m.heureRetour || '';
    document.getElementById('f-date-creation').value   = m.dateCreation || '';
    document.getElementById('f-lieu-creation').value   = m.lieuCreation || '';

    // Transport
    const setChk = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.checked = !!val;
    };
    setChk('f-covoiturage', m.covoiturage);
    setChk('f-vehicule-service', m.vehiculeService);
    setChk('f-transport-commun', m.transportCommun);
    setChk('f-vehicule-perso', m.vehiculePerso);

    if (m.vehiculeService) {
      const el = document.getElementById('f-vehicule-service-num');
      el.disabled = false;
      el.value = m.vehiculeServiceNum || '';
    }

    if (m.vehiculePerso) {
      ['f-vehicule-perso-marque','f-vehicule-perso-pf'].forEach(id => {
        document.getElementById(id).disabled = false;
      });
      document.getElementById('f-vehicule-perso-marque').value = m.vehiculePersoMarque || '';
      document.getElementById('f-vehicule-perso-pf').value     = m.puissanceFiscale || '';
    }

    if (m.vehiculeService || m.vehiculePerso) {
      document.getElementById('km-row').classList.remove('hidden');
      document.getElementById('f-kilometrage').value = m.kilometrage || '';
    }

    // Show existing numero
    document.getElementById('form-numero').textContent = m.numero || '—';
  }

  /* ---- Delete mission ---- */

  function confirmDelete(id) {
    const m = getById(id);
    if (!m) return;
    App.showConfirm(
      `Supprimer la mission <strong>${_esc(m.numero)}</strong> de ${_esc(m.agent.nom)} ? Cette action est irréversible.`,
      () => {
        remove(id);
        History.render();
        Dashboard.render();
        App.showToast('Mission supprimée', `${m.numero} a été supprimé.`, 'warning');
      }
    );
  }

  /* ---- Transport checkbox interactivity ---- */

  function initTransportListeners() {
    // Véhicule de service
    const vhSvc = document.getElementById('f-vehicule-service');
    const vhSvcNum = document.getElementById('f-vehicule-service-num');
    if (vhSvc) {
      vhSvc.addEventListener('change', function() {
        vhSvcNum.disabled = !this.checked;
        if (!this.checked) vhSvcNum.value = '';
        _updateKmRow();
      });
    }

    // Véhicule personnel
    const vhPerso = document.getElementById('f-vehicule-perso');
    const vhPersoMarque = document.getElementById('f-vehicule-perso-marque');
    const vhPersoPf     = document.getElementById('f-vehicule-perso-pf');
    if (vhPerso) {
      vhPerso.addEventListener('change', function() {
        vhPersoMarque.disabled = !this.checked;
        vhPersoPf.disabled = !this.checked;
        if (!this.checked) {
          vhPersoMarque.value = '';
          vhPersoPf.value = '';
        }
        _updateKmRow();
      });
    }
  }

  function _updateKmRow() {
    const vhSvc   = document.getElementById('f-vehicule-service')?.checked;
    const vhPerso = document.getElementById('f-vehicule-perso')?.checked;
    const kmRow   = document.getElementById('km-row');
    if (kmRow) {
      if (vhSvc || vhPerso) {
        kmRow.classList.remove('hidden');
      } else {
        kmRow.classList.add('hidden');
        const km = document.getElementById('f-kilometrage');
        if (km) km.value = '';
      }
    }
  }

  /* ---- Refresh form header (numero + date display) ---- */

  function refreshFormHeader() {
    const y = new Date().getFullYear();
    const next = peekNextNumber(y);
    const numEl = document.getElementById('form-numero');
    if (numEl) numEl.textContent = next;

    const today = new Date().toISOString().slice(0, 10);
    const dcEl = document.getElementById('f-date-creation');
    if (dcEl && !dcEl.value) dcEl.value = today;

    const displayEl = document.getElementById('form-date-display');
    if (displayEl) {
      displayEl.textContent = _formatDate(today);
    }
  }

  function _formatDate(iso) {
    if (!iso) return '–';
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
  }

  function _esc(str) {
    return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  /* ---- Init ---- */

  function init() {
    const form = document.getElementById('mission-form');
    if (form) form.addEventListener('submit', saveFromForm);

    const previewBtn = document.getElementById('btn-preview-mission');
    if (previewBtn) previewBtn.addEventListener('click', previewFromForm);

    const resetBtn = document.getElementById('btn-reset-mission');
    if (resetBtn) resetBtn.addEventListener('click', () => {
      resetForm();
      App.showToast('Formulaire réinitialisé', '', 'info');
    });

    initTransportListeners();
    refreshFormHeader();

    // Set today for creation date
    const today = new Date().toISOString().slice(0, 10);
    const dcEl = document.getElementById('f-date-creation');
    if (dcEl) dcEl.value = today;
  }

  return {
    init,
    getAll,
    getVisibleMissions,
    getVisibleByMonth,
    getById,
    getByMonth,
    save,
    remove,
    edit,
    confirmDelete,
    resetForm,
    refreshFormHeader,
    calcDays,
    previewFromForm
  };
})();
