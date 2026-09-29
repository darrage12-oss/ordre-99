/**
 * cloud_sync.js - Module de synchronisation temps réel Cloud pour Ordre de Mission SRM TTA
 * Fonctionne instantanément entre PC et Téléphones portables (4G / 5G / Wi-Fi)
 * via le protocole Cloud HTTPS / Server-Sent Events (SSE) avec réconciliation automatique.
 */

const CloudSync = (() => {
  'use strict';

  const STORAGE_CONFIG_KEY = 'ordre_mission_cloud_config';
  const DEFAULT_TOPIC = 'srm_tta_ouezzane_om_sync_2026';
  const DEFAULT_SERVER = 'https://ntfy.sh';

  // ID unique pour cet appareil/onglet afin d'éviter les boucles d'écho
  const _clientId = 'dev_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 5);

  let _config = {
    server: DEFAULT_SERVER,
    topic: DEFAULT_TOPIC,
    firebaseUrl: '',
    autoSync: true,
    lastSync: 0
  };

  let _eventSource = null;
  let _pollInterval = null;
  let _isOnline = false;
  let _lastProcessedTime = 0;
  let _isSending = false;

  /* ---- 1. Gestion de la configuration ---- */
  function loadConfig() {
    try {
      const saved = localStorage.getItem(STORAGE_CONFIG_KEY);
      if (saved) {
        _config = { ..._config, ...JSON.parse(saved) };
      }
    } catch (e) {
      console.warn('[CloudSync] Erreur chargement config:', e);
    }
    // Nettoyer le nom de topic
    if (!_config.topic) _config.topic = DEFAULT_TOPIC;
    _config.topic = _config.topic.toLowerCase().replace(/[^a-z0-9_-]/g, '_');
  }

  function saveConfig() {
    localStorage.setItem(STORAGE_CONFIG_KEY, JSON.stringify(_config));
  }

  /* ---- 2. Badge UI barre supérieure ---- */
  function updateBadge(status, text) {
    const badge = document.getElementById('cloud-status-badge');
    if (!badge) return;

    badge.className = `cloud-badge status-${status}`;
    let icon = 'fa-cloud';
    if (status === 'online') icon = 'fa-cloud-arrow-up';
    if (status === 'syncing') icon = 'fa-arrows-rotate fa-spin';
    if (status === 'offline') icon = 'fa-cloud-slash';

    badge.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${text}</span>`;
  }

  /* ---- 3. Connexion temps réel SSE (Server-Sent Events) ---- */
  function _connectSSE() {
    if (_eventSource) {
      try { _eventSource.close(); } catch (e) {}
      _eventSource = null;
    }

    const sseUrl = `${_config.server}/${_config.topic}/sse`;

    try {
      _eventSource = new EventSource(sseUrl);

      _eventSource.onopen = () => {
        _isOnline = true;
        const total = (typeof Missions !== 'undefined') ? Missions.getAll().length : 0;
        updateBadge('online', `En direct (${total} OM)`);
      };

      _eventSource.onmessage = async (event) => {
        try {
          const raw = JSON.parse(event.data);
          if (raw.attachment && raw.attachment.url) {
            try {
              const fileRes = await fetch(raw.attachment.url);
              const payload = await fileRes.json();
              _handleIncomingPayload(payload, raw.time);
              return;
            } catch (fe) {}
          }
          if (raw.event === 'message' && raw.message) {
            const payload = JSON.parse(raw.message);
            _handleIncomingPayload(payload, raw.time);
          }
        } catch (e) {
          // Message brut non-JSON ignoré
        }
      };

      _eventSource.onerror = () => {
        _isOnline = false;
        updateBadge('syncing', 'Reconnexion...');
      };
    } catch (err) {
      console.warn('[CloudSync] Erreur création SSE:', err);
      updateBadge('offline', 'Hors ligne');
    }
  }

  /* ---- 4. Rattrapage d'historique (Polling) ---- */
  async function _pollCatchUp() {
    try {
      const sinceParam = _lastProcessedTime ? (_lastProcessedTime + 1) : '12h';
      const pollUrl = `${_config.server}/${_config.topic}/json?poll=1&since=${sinceParam}`;

      const res = await fetch(pollUrl, { cache: 'no-store' });
      if (!res.ok) return;

      const text = await res.text();
      if (!text.trim()) return;

      // ntfy renvoie des lignes JSON distinctes
      const lines = text.split('\n');
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const raw = JSON.parse(line);
          if (raw.attachment && raw.attachment.url) {
            try {
              const fileRes = await fetch(raw.attachment.url);
              const payload = await fileRes.json();
              _handleIncomingPayload(payload, raw.time);
              continue;
            } catch (fe) {}
          }
          if (raw.event === 'message' && raw.message) {
            const payload = JSON.parse(raw.message);
            _handleIncomingPayload(payload, raw.time);
          }
        } catch (e) {}
      }
    } catch (e) {
      // Ignoré en arrière-plan
    }
  }

  /* ---- 5. Traitement des données entrantes ---- */
  function _handleIncomingPayload(payload, eventTime) {
    if (!payload || typeof payload !== 'object') return;
    if (eventTime && eventTime > _lastProcessedTime) {
      _lastProcessedTime = eventTime;
    }

    // Éviter de traiter nos propres messages envoyés
    if (payload.sender === _clientId) return;

    // A. Demande de synchronisation complète par un nouvel appareil
    if (payload.type === 'REQUEST_FULL_SYNC') {
      // Un autre appareil (PC ou téléphone) vient de s'ouvrir et demande les données actuelles
      setTimeout(() => {
        pushAllData(true);
      }, 500);
      return;
    }

    // B. Réception de données (SYNC_UPDATE ou FULL_SYNC)
    if (payload.type === 'SYNC_UPDATE' || payload.type === 'FULL_SYNC') {
      const { newMissionsCount, updatedMatricules } = _mergeRemoteData(payload);

      if (newMissionsCount > 0) {
        const matText = updatedMatricules.length > 0 ? ` (Matricule: ${updatedMatricules.join(', ')})` : '';
        if (typeof App !== 'undefined' && App.showToast) {
          App.showToast(
            'Synchronisation Mobile ↔ PC',
            `+${newMissionsCount} ordre(s) de mission reçu(s) en direct${matText} !`,
            'success'
          );
        }
      }

      const total = (typeof Missions !== 'undefined') ? Missions.getAll().length : 0;
      updateBadge('online', `En direct (${total} OM)`);
    }

    // C. Réception d'un PING de test
    if (payload.type === 'TEST_PING') {
      if (typeof App !== 'undefined' && App.showToast) {
        App.showToast('Test Cloud Réussi', `Signal reçu depuis un autre appareil !`, 'info');
      }
    }
  }

  /* ---- 6. Fusion intelligente des données reçues ---- */
  function _mergeRemoteData(payload) {
    let hasChanges = false;
    let newMissionsCount = 0;
    const updatedMatricules = [];

    // 1. Missions
    if (Array.isArray(payload.missions) && typeof Missions !== 'undefined') {
      const localMissions = Missions.getAll();
      const localMap = new Map(localMissions.map(m => [m.id, m]));

      payload.missions.forEach(rm => {
        if (!rm || !rm.id) return;
        const existing = localMap.get(rm.id);

        if (!existing) {
          localMap.set(rm.id, rm);
          newMissionsCount++;
          hasChanges = true;
          const mat = rm.agent?.matricule;
          if (mat && !updatedMatricules.includes(mat)) updatedMatricules.push(mat);
        } else {
          // Si distant est plus récent que local
          const remoteTime = new Date(rm.updatedAt || rm.createdAt || 0).getTime();
          const localTime = new Date(existing.updatedAt || existing.createdAt || 0).getTime();
          if (remoteTime > localTime) {
            localMap.set(rm.id, rm);
            hasChanges = true;
          }
        }
      });

      if (hasChanges) {
        localStorage.setItem('ordre_mission_missions', JSON.stringify(Array.from(localMap.values())));
      }
    }

    // 2. Agents (Users)
    if (Array.isArray(payload.users) && typeof Users !== 'undefined') {
      const localUsers = Users.getAll();
      const localMap = new Map(localUsers.map(u => [u.id, u]));
      let usersChanged = false;

      payload.users.forEach(ru => {
        if (!ru || !ru.id) return;
        if (!localMap.has(ru.id)) {
          localMap.set(ru.id, ru);
          usersChanged = true;
        }
      });

      if (usersChanged) {
        hasChanges = true;
        localStorage.setItem('ordre_mission_users', JSON.stringify(Array.from(localMap.values())));
        const sel = document.getElementById('active-agent-select');
        if (sel) Users.populateDropdown(sel);
      }
    }

    // 3. Rafraîchir les composants de l'interface
    if (hasChanges) {
      if (typeof History !== 'undefined' && typeof History.render === 'function') {
        History.render();
      }
      if (typeof Dashboard !== 'undefined' && typeof Dashboard.render === 'function') {
        Dashboard.render();
      }
      if (typeof Users !== 'undefined' && typeof Users.renderList === 'function') {
        Users.renderList();
      }
    }

    return { newMissionsCount, updatedMatricules };
  }

  /* ---- 7. Publication d'un message vers le Cloud ---- */
  async function _publish(payload) {
    if (_isSending) return;
    _isSending = true;

    try {
      updateBadge('syncing', 'Envoi en cours...');

      const postUrl = `${_config.server}/${_config.topic}`;
      const res = await fetch(postUrl, {
        method: 'POST',
        headers: {
          'Title': 'SRM TTA Sync'
        },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        _isOnline = true;
        const total = (typeof Missions !== 'undefined') ? Missions.getAll().length : 0;
        updateBadge('online', `En direct (${total} OM)`);
      } else {
        updateBadge('offline', 'Erreur envoi');
      }
    } catch (err) {
      console.warn('[CloudSync] Erreur publication:', err);
      updateBadge('offline', 'Erreur réseau');
    } finally {
      _isSending = false;
    }
  }

  /* ---- 8. Action appelée lors d'une modification locale ---- */
  function onLocalChange() {
    pushAllData(false);
  }

  /* ---- 9. Envoi complet des données locales ---- */
  function pushAllData(isFullSync = false) {
    const missions = (typeof Missions !== 'undefined') ? Missions.getAll() : [];
    const users = (typeof Users !== 'undefined') ? Users.getAll() : [];

    const payload = {
      type: isFullSync ? 'FULL_SYNC' : 'SYNC_UPDATE',
      sender: _clientId,
      timestamp: Date.now(),
      missions: missions,
      users: users
    };

    _publish(payload);

    // Optionnel : sauvegarde Firebase si renseignée
    if (_config.firebaseUrl) {
      _syncWithFirebase(payload);
    }
  }

  /* ---- 10. Option Firebase Realtime Database (si configurée) ---- */
  async function _syncWithFirebase(payload) {
    let url = _config.firebaseUrl.trim().replace(/\/+$/, '');
    if (!url.endsWith('.json')) url += '/srm_data.json';

    try {
      await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } catch (e) {
      console.warn('[CloudSync] Erreur Firebase:', e);
    }
  }

  /* ---- 11. Modal de gestion et test ---- */
  function openConfigModal() {
    let modal = document.getElementById('cloud-config-modal');
    if (!modal) {
      const modalHtml = `
      <div class="modal-overlay" id="cloud-config-modal">
        <div class="modal-box" style="max-width:540px;">
          <div class="modal-header">
            <h3><i class="fa-solid fa-cloud-arrow-up"></i> Synchronisation PC ↔ Portable</h3>
            <button class="modal-close" onclick="CloudSync.closeConfigModal()">&times;</button>
          </div>
          <div class="modal-body" style="padding:18px 20px;">
            <div style="background:#eafaf1;border:1px solid #a9dfbf;border-radius:8px;padding:12px 14px;margin-bottom:15px;display:flex;align-items:center;gap:12px;">
              <i class="fa-solid fa-circle-check" style="font-size:1.6rem;color:#27ae60;"></i>
              <div>
                <strong style="color:#196f3d;font-size:0.95rem;">Synchronisation Cloud Automatique Active</strong>
                <p style="margin:2px 0 0 0;font-size:0.8rem;color:#2c3e50;">
                  Tout ordre de mission créé sur téléphone ou PC apparaît automatiquement et instantanément sur tous vos appareils.
                </p>
              </div>
            </div>

            <div class="form-group" style="margin-bottom:14px;">
              <label class="form-label" style="font-weight:700;">Canal partagé (Équipe SRM TTA) :</label>
              <input type="text" id="cfg-topic-id" class="form-control" value="${_config.topic}" placeholder="${DEFAULT_TOPIC}" />
              <small style="color:var(--text-muted);font-size:0.75rem;">Tous vos téléphones et PC utilisant ce même canal sont automatiquement reliés en direct.</small>
            </div>

            <div class="form-group" style="margin-bottom:14px;">
              <label class="form-label" style="font-weight:700;">Base Firebase de secours (Optionnelle) :</label>
              <input type="url" id="cfg-firebase-url" class="form-control" value="${_config.firebaseUrl}" placeholder="https://votre-projet.firebaseio.com" />
              <small style="color:var(--text-muted);font-size:0.75rem;">Optionnel. Laissez vide si vous utilisez le Cloud instantané standard.</small>
            </div>

            <div style="background:#f8f9fa;border:1px solid #e9ecef;border-radius:6px;padding:12px;margin-top:10px;">
              <div style="font-weight:700;font-size:0.85rem;color:#1a5276;margin-bottom:6px;">
                <i class="fa-solid fa-bolt"></i> Actions de synchronisation :
              </div>
              <div style="display:flex;gap:10px;flex-wrap:wrap;">
                <button type="button" class="btn btn-secondary btn-sm" onclick="CloudSync.testSync()">
                  <i class="fa-solid fa-paper-plane"></i> Tester la connexion
                </button>
                <button type="button" class="btn btn-outline btn-sm" onclick="CloudSync.pushAllData(true)">
                  <i class="fa-solid fa-arrows-rotate"></i> Forcer l'envoi de toutes mes données
                </button>
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-outline" onclick="CloudSync.closeConfigModal()">Fermer</button>
            <button class="btn btn-primary" onclick="CloudSync.saveConfigFromModal()">
              <i class="fa-solid fa-floppy-disk"></i> Enregistrer
            </button>
          </div>
        </div>
      </div>`;
      document.body.insertAdjacentHTML('beforeend', modalHtml);
      modal = document.getElementById('cloud-config-modal');
    }

    modal.classList.add('open');
  }

  function closeConfigModal() {
    const modal = document.getElementById('cloud-config-modal');
    if (modal) modal.classList.remove('open');
  }

  function saveConfigFromModal() {
    const topicInput = document.getElementById('cfg-topic-id');
    const fbInput = document.getElementById('cfg-firebase-url');

    if (topicInput && topicInput.value.trim()) {
      _config.topic = topicInput.value.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_');
    }
    if (fbInput) {
      _config.firebaseUrl = fbInput.value.trim();
    }

    saveConfig();
    closeConfigModal();

    if (typeof App !== 'undefined' && App.showToast) {
      App.showToast('Configuration enregistrée', 'Reconnexion au canal Cloud...', 'success');
    }

    init();
  }

  async function testSync() {
    updateBadge('syncing', 'Test envoi...');
    await _publish({
      type: 'TEST_PING',
      sender: _clientId,
      time: Date.now()
    });

    if (typeof App !== 'undefined' && App.showToast) {
      App.showToast('Test Cloud', 'Signal de synchronisation transmis avec succès sur le Cloud !', 'success');
    }
  }

  async function _fetchFromFirebase() {
    if (!_config.firebaseUrl) return;
    let url = _config.firebaseUrl.trim().replace(/\/+$/, '');
    if (!url.endsWith('.json')) url += '/srm_data.json';

    try {
      const res = await fetch(url + '?t=' + Date.now());
      if (res.ok) {
        const data = await res.json();
        if (data) {
          _mergeRemoteData(data);
          const total = (typeof Missions !== 'undefined') ? Missions.getAll().length : 0;
          updateBadge('online', `En direct (${total} OM)`);
        }
      }
    } catch (e) {
      console.warn('[CloudSync] Erreur lecture Firebase:', e);
    }
  }

  /* ---- 12. Initialisation générale ---- */
  function init() {
    loadConfig();

    updateBadge('syncing', 'Connexion Cloud...');

    // 0. Si Firebase est configuré, récupérer d'abord depuis Firebase
    if (_config.firebaseUrl) {
      _fetchFromFirebase();
    }

    // 1. Connecter le flux Server-Sent Events (SSE) pour le temps réel
    _connectSSE();

    // 2. Récupérer immédiatement l'historique des dernières heures
    _pollCatchUp();

    // 3. Diffuser nos données locales ou demander une synchronisation
    setTimeout(() => {
      const localMissions = (typeof Missions !== 'undefined') ? Missions.getAll() : [];
      if (localMissions.length > 0) {
        pushAllData(false);
      } else {
        _publish({
          type: 'REQUEST_FULL_SYNC',
          sender: _clientId
        });
      }
    }, 1500);

    // 4. Polling périodique de rattrapage toutes les 15 secondes
    if (_pollInterval) clearInterval(_pollInterval);
    _pollInterval = setInterval(() => {
      _pollCatchUp();
      if (_config.firebaseUrl) _fetchFromFirebase();
    }, 15000);
  }

  return {
    init,
    onLocalChange,
    pushAllData,
    openConfigModal,
    closeConfigModal,
    saveConfigFromModal,
    testSync
  };
})();
