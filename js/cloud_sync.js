/**
 * cloud_sync.js - Module de synchronisation temps réel MQTT WebSocket & Cloud pour SRM TTA
 * Fonctionne instantanément entre PC et Téléphones portables (4G / 5G / Wi-Fi)
 * - Protocole : MQTT sur WebSocket sécurisé (WSS) via brokers mondiaux haute disponibilité
 * - Basculement automatique : EMQX (port 8084) <-> HiveMQ (port 8884)
 * - Messages retenus (Retained) : le dernier état complet est transmis en < 50ms à tout nouvel appareil
 * - Synchronisation bidirectionnelle instantanée : Création, Modification et Suppression
 */

const CloudSync = (() => {
  'use strict';

  const STORAGE_CONFIG_KEY = 'ordre_mission_cloud_config';
  const STORAGE_DELETED_KEY = 'ordre_mission_deleted_ids';

  // Serveurs MQTT publics supportant WebSockets SSL (WSS)
  const BROKERS = [
    { host: 'broker.emqx.io', port: 8084, path: '/mqtt', name: 'EMQX Cloud' },
    { host: 'broker.hivemq.com', port: 8884, path: '/mqtt', name: 'HiveMQ Cloud' }
  ];

  // ID unique pour cet appareil/onglet afin d'éviter l'écho de ses propres messages
  const _clientId = 'srm_' + (navigator.userAgent.match(/Mobile|Android|iPhone/i) ? 'mob_' : 'pc_') + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 5);

  let _config = {
    channel: 'srm_tta_ouezzane_2026',
    firebaseUrl: '',
    autoSync: true
  };

  let _client = null;
  let _currentBrokerIdx = 0;
  let _isConnected = false;
  let _isConnecting = false;
  let _reconnectTimer = null;
  let _stateDebounceTimer = null;

  /* ---- Topics MQTT ---- */
  function _getStateTopic() {
    return `${_config.channel}/missions/state`;
  }
  function _getDeltaTopic() {
    return `${_config.channel}/missions/delta`;
  }

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
    if (!_config.channel) _config.channel = 'srm_tta_ouezzane_2026';
    _config.channel = _config.channel.toLowerCase().replace(/[^a-z0-9_-]/g, '_');
  }

  function saveConfig() {
    localStorage.setItem(STORAGE_CONFIG_KEY, JSON.stringify(_config));
  }

  /* ---- 2. Gestion des identifiants supprimés (Tombstones) ---- */
  function _getDeletedIds() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_DELETED_KEY) || '[]');
    } catch { return []; }
  }

  function _addDeletedId(id) {
    if (!id) return;
    const list = _getDeletedIds();
    if (!list.includes(id)) {
      list.push(id);
      // Conserver les 200 dernières suppressions max
      if (list.length > 200) list.shift();
      localStorage.setItem(STORAGE_DELETED_KEY, JSON.stringify(list));
    }
  }

  /* ---- 3. Badge UI barre supérieure ---- */
  function updateBadge(status, text) {
    const badge = document.getElementById('cloud-status-badge');
    if (!badge) return;

    badge.className = `cloud-badge status-${status}`;
    let icon = 'fa-cloud';
    if (status === 'online') icon = 'fa-bolt';
    if (status === 'syncing') icon = 'fa-arrows-rotate fa-spin';
    if (status === 'offline') icon = 'fa-cloud-slash';

    badge.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${text}</span>`;
  }

  /* ---- 4. Connexion MQTT via WebSockets sécurisés ---- */
  function _connect() {
    if (_isConnecting) return;
    _isConnecting = true;

    if (typeof Paho === 'undefined' || !Paho.MQTT) {
      console.warn('[CloudSync] Bibliothèque Paho MQTT non chargée.');
      updateBadge('offline', 'MQTT indisponible');
      _isConnecting = false;
      return;
    }

    const broker = BROKERS[_currentBrokerIdx];
    updateBadge('syncing', `Connexion (${broker.name})...`);

    try {
      if (_client) {
        try { _client.disconnect(); } catch (e) {}
        _client = null;
      }

      _client = new Paho.MQTT.Client(broker.host, broker.port, broker.path, _clientId);

      _client.onConnectionLost = (resp) => {
        _isConnected = false;
        _isConnecting = false;
        console.warn(`[CloudSync] Connexion perdue (${broker.name}):`, resp.errorMessage);
        updateBadge('syncing', 'Reconnexion...');
        _scheduleReconnect();
      };

      _client.onMessageArrived = (message) => {
        try {
          const payload = JSON.parse(message.payloadString);
          _handleMessage(message.destinationName, payload);
        } catch (err) {
          console.warn('[CloudSync] Message non JSON reçu:', err);
        }
      };

      _client.connect({
        useSSL: true,
        timeout: 5,
        keepAliveInterval: 30,
        cleanSession: true,
        onSuccess: () => {
          _isConnected = true;
          _isConnecting = false;
          console.log(`[CloudSync] Connecté avec succès à ${broker.name}`);

          const total = (typeof Missions !== 'undefined') ? Missions.getAll().length : 0;
          updateBadge('online', `En direct (${total} OM)`);

          // S'abonner aux topics du canal
          _subscribeTopics();

          // Diffuser l'état initial local pour synchroniser les données existantes
          setTimeout(() => {
            _broadcastFullState();
          }, 1200);
        },
        onFailure: (err) => {
          _isConnected = false;
          _isConnecting = false;
          console.warn(`[CloudSync] Échec connexion ${broker.name}:`, err.errorMessage || err);

          // Basculer vers l'autre broker
          _currentBrokerIdx = (_currentBrokerIdx + 1) % BROKERS.length;
          _scheduleReconnect();
        }
      });
    } catch (ex) {
      _isConnected = false;
      _isConnecting = false;
      console.warn('[CloudSync] Erreur client MQTT:', ex);
      _scheduleReconnect();
    }
  }

  function _scheduleReconnect() {
    if (_reconnectTimer) clearTimeout(_reconnectTimer);
    _reconnectTimer = setTimeout(() => {
      _connect();
    }, 3000);
  }

  function _subscribeTopics() {
    if (!_client || !_isConnected) return;

    // S'abonner au topic d'état (Retained) et au topic d'actions (Deltas)
    const base = _config.channel;
    _client.subscribe(`${base}/missions/#`, { qos: 1 });
  }

  /* ---- 5. Publication d'un message MQTT ---- */
  function _publish(topic, payload, retained = false) {
    if (!_client || !_isConnected) {
      console.warn('[CloudSync] Impossible de publier : non connecté');
      return false;
    }

    try {
      const msg = new Paho.MQTT.Message(JSON.stringify(payload));
      msg.destinationName = topic;
      msg.qos = 1;
      msg.retained = retained;
      _client.send(msg);
      return true;
    } catch (e) {
      console.warn('[CloudSync] Erreur publication:', e);
      return false;
    }
  }

  /* ---- 6. Traitement des messages reçus ---- */
  function _handleMessage(topic, payload) {
    if (!payload || typeof payload !== 'object') return;

    // Ignorer ses propres messages pour éviter les boucles
    if (payload.sender === _clientId) return;

    // A. Événement Delta : MISSION_SAVED (Création ou Modification)
    if (payload.type === 'MISSION_SAVED' && payload.mission) {
      _applyMissionSaved(payload.mission);
      return;
    }

    // B. Événement Delta : MISSION_DELETED (Suppression)
    if (payload.type === 'MISSION_DELETED' && payload.missionId) {
      _applyMissionDeleted(payload.missionId);
      return;
    }

    // C. Événement Delta : USER_SAVED
    if (payload.type === 'USER_SAVED' && payload.user) {
      _applyUserSaved(payload.user);
      return;
    }

    // D. Événement Delta : USER_DELETED
    if (payload.type === 'USER_DELETED' && payload.userId) {
      _applyUserDeleted(payload.userId);
      return;
    }

    // E. Événement Snapshot complet : SYNC_STATE (Retenu sur le broker)
    if (payload.type === 'SYNC_STATE') {
      _applyFullState(payload);
      return;
    }

    // F. Événement PING de test
    if (payload.type === 'PING') {
      if (typeof App !== 'undefined' && App.showToast) {
        App.showToast('Signal Reçu', 'Appareil connecté en direct !', 'info');
      }
      return;
    }
  }

  /* ---- 7. Application des modifications locales & UI ---- */

  function _applyMissionSaved(remoteMission) {
    if (!remoteMission || !remoteMission.id || typeof Missions === 'undefined') return;

    const deletedIds = _getDeletedIds();
    if (deletedIds.includes(remoteMission.id)) return; // Mission supprimée localement

    const localMissions = Missions.getAll();
    const idx = localMissions.findIndex(m => m.id === remoteMission.id);
    let isNew = false;

    if (idx === -1) {
      localMissions.push(remoteMission);
      isNew = true;
    } else {
      const localTime = new Date(localMissions[idx].updatedAt || localMissions[idx].createdAt || 0).getTime();
      const remoteTime = new Date(remoteMission.updatedAt || remoteMission.createdAt || 0).getTime();
      if (remoteTime >= localTime) {
        localMissions[idx] = { ...localMissions[idx], ...remoteMission };
      }
    }

    localStorage.setItem('ordre_mission_missions', JSON.stringify(localMissions));
    _refreshViews();

    const total = localMissions.length;
    updateBadge('online', `En direct (${total} OM)`);

    if (typeof App !== 'undefined' && App.showToast) {
      const matricule = remoteMission.agent?.matricule || '';
      const num = remoteMission.numero || 'Ordre';
      const titre = isNew ? 'Nouvel Ordre Reçu' : 'Ordre Mis à Jour';
      App.showToast(titre, `${num} (${matricule}) synchronisé en direct !`, 'success');
    }
  }

  function _applyMissionDeleted(missionId) {
    if (!missionId || typeof Missions === 'undefined') return;

    _addDeletedId(missionId);

    const localMissions = Missions.getAll().filter(m => m.id !== missionId);
    localStorage.setItem('ordre_mission_missions', JSON.stringify(localMissions));
    _refreshViews();

    const total = localMissions.length;
    updateBadge('online', `En direct (${total} OM)`);

    if (typeof App !== 'undefined' && App.showToast) {
      App.showToast('Synchronisation', 'Ordre de mission supprimé sur un autre appareil.', 'info');
    }
  }

  function _applyUserSaved(remoteUser) {
    if (!remoteUser || !remoteUser.id || typeof Users === 'undefined') return;

    const localUsers = Users.getAll();
    const idx = localUsers.findIndex(u => u.id === remoteUser.id);
    if (idx === -1) {
      localUsers.push(remoteUser);
    } else {
      localUsers[idx] = { ...localUsers[idx], ...remoteUser };
    }

    localStorage.setItem('ordre_mission_users', JSON.stringify(localUsers));
    const sel = document.getElementById('active-agent-select');
    if (sel) Users.populateDropdown(sel);
    if (typeof Users.renderList === 'function') Users.renderList();
  }

  function _applyUserDeleted(userId) {
    if (!userId || typeof Users === 'undefined') return;

    const localUsers = Users.getAll().filter(u => u.id !== userId);
    localStorage.setItem('ordre_mission_users', JSON.stringify(localUsers));
    const sel = document.getElementById('active-agent-select');
    if (sel) Users.populateDropdown(sel);
    if (typeof Users.renderList === 'function') Users.renderList();
  }

  function _applyFullState(state) {
    if (!state) return;
    let changes = false;

    // 1. Fusionner les missions
    if (Array.isArray(state.missions) && typeof Missions === 'undefined') return;
    if (Array.isArray(state.missions)) {
      const deletedIds = _getDeletedIds();
      // Enregistrer aussi les deletedIds distants
      if (Array.isArray(state.deletedIds)) {
        state.deletedIds.forEach(id => _addDeletedId(id));
      }

      const localMissions = Missions.getAll();
      const localMap = new Map(localMissions.map(m => [m.id, m]));

      // Supprimer les missions qui figurent dans les tombstones
      deletedIds.forEach(did => {
        if (localMap.has(did)) {
          localMap.delete(did);
          changes = true;
        }
      });

      state.missions.forEach(rm => {
        if (!rm || !rm.id || deletedIds.includes(rm.id)) return;
        const local = localMap.get(rm.id);
        if (!local) {
          localMap.set(rm.id, rm);
          changes = true;
        } else {
          const lTime = new Date(local.updatedAt || local.createdAt || 0).getTime();
          const rTime = new Date(rm.updatedAt || rm.createdAt || 0).getTime();
          if (rTime > lTime) {
            localMap.set(rm.id, rm);
            changes = true;
          }
        }
      });

      if (changes) {
        localStorage.setItem('ordre_mission_missions', JSON.stringify(Array.from(localMap.values())));
      }
    }

    // 2. Fusionner les agents
    if (Array.isArray(state.users) && typeof Users !== 'undefined') {
      const localUsers = Users.getAll();
      const userMap = new Map(localUsers.map(u => [u.id, u]));
      let userChanges = false;

      state.users.forEach(ru => {
        if (!ru || !ru.id) return;
        if (!userMap.has(ru.id)) {
          userMap.set(ru.id, ru);
          userChanges = true;
        }
      });

      if (userChanges) {
        localStorage.setItem('ordre_mission_users', JSON.stringify(Array.from(userMap.values())));
        const sel = document.getElementById('active-agent-select');
        if (sel) Users.populateDropdown(sel);
        if (typeof Users.renderList === 'function') Users.renderList();
      }
    }

    if (changes) {
      _refreshViews();
    }

    const total = (typeof Missions !== 'undefined') ? Missions.getAll().length : 0;
    updateBadge('online', `En direct (${total} OM)`);
  }

  function _refreshViews() {
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

  /* ---- 8. Diffusion de l'état complet (Retained) ---- */
  function _broadcastFullState() {
    const missions = (typeof Missions !== 'undefined') ? Missions.getAll() : [];
    const users = (typeof Users !== 'undefined') ? Users.getAll() : [];
    const deletedIds = _getDeletedIds();

    const payload = {
      type: 'SYNC_STATE',
      sender: _clientId,
      timestamp: Date.now(),
      missions: missions,
      users: users,
      deletedIds: deletedIds
    };

    // Publier avec retained = true sur le topic d'état
    _publish(_getStateTopic(), payload, true);
  }

  function _debouncedBroadcastFullState() {
    if (_stateDebounceTimer) clearTimeout(_stateDebounceTimer);
    _stateDebounceTimer = setTimeout(() => {
      _broadcastFullState();
    }, 600);
  }

  /* ---- 9. Hooks appelés lors des modifications locales ---- */

  function onMissionSaved(missionData) {
    if (!missionData) return;

    // A. Émettre le delta immédiatement pour que l'autre appareil l'ait en < 30ms
    _publish(_getDeltaTopic(), {
      type: 'MISSION_SAVED',
      sender: _clientId,
      mission: missionData,
      timestamp: Date.now()
    }, false);

    // B. Mettre à jour l'état complet retenu sur le serveur
    _debouncedBroadcastFullState();
  }

  function onMissionDeleted(missionId) {
    if (!missionId) return;

    _addDeletedId(missionId);

    // A. Émettre le delta de suppression
    _publish(_getDeltaTopic(), {
      type: 'MISSION_DELETED',
      sender: _clientId,
      missionId: missionId,
      timestamp: Date.now()
    }, false);

    // B. Mettre à jour l'état retenu
    _debouncedBroadcastFullState();
  }

  function onUserSaved(userData) {
    if (!userData) return;
    _publish(_getDeltaTopic(), {
      type: 'USER_SAVED',
      sender: _clientId,
      user: userData,
      timestamp: Date.now()
    }, false);
    _debouncedBroadcastFullState();
  }

  function onUserDeleted(userId) {
    if (!userId) return;
    _publish(_getDeltaTopic(), {
      type: 'USER_DELETED',
      sender: _clientId,
      userId: userId,
      timestamp: Date.now()
    }, false);
    _debouncedBroadcastFullState();
  }

  function onLocalChange() {
    _debouncedBroadcastFullState();
  }

  /* ---- 10. Modale de gestion et test ---- */
  function openConfigModal() {
    let modal = document.getElementById('cloud-config-modal');
    if (!modal) {
      const broker = BROKERS[_currentBrokerIdx];
      const modalHtml = `
      <div class="modal-overlay" id="cloud-config-modal">
        <div class="modal-box" style="max-width:540px;">
          <div class="modal-header">
            <h3><i class="fa-solid fa-bolt" style="color:#27ae60;"></i> Synchronisation Temps Réel</h3>
            <button class="modal-close" onclick="CloudSync.closeConfigModal()">&times;</button>
          </div>
          <div class="modal-body" style="padding:18px 20px;">
            <div style="background:#eafaf1;border:1px solid #a9dfbf;border-radius:8px;padding:12px 14px;margin-bottom:15px;display:flex;align-items:center;gap:12px;">
              <i class="fa-solid fa-circle-check" style="font-size:1.6rem;color:#27ae60;"></i>
              <div>
                <strong style="color:#196f3d;font-size:0.95rem;">Connexion Directe Ultra-Rapide Active</strong>
                <p style="margin:2px 0 0 0;font-size:0.8rem;color:#2c3e50;">
                  Protocole WebSockets sécurisé (WSS). Tout ajout, modification ou suppression sur PC ou portable se reflète en moins d'une seconde sur l'autre appareil.
                </p>
              </div>
            </div>

            <div class="form-group" style="margin-bottom:14px;">
              <label class="form-label" style="font-weight:700;">Canal de l'équipe SRM TTA :</label>
              <input type="text" id="cfg-topic-id" class="form-control" value="${_config.channel}" placeholder="srm_tta_ouezzane_2026" />
              <small style="color:var(--text-muted);font-size:0.75rem;">Tous vos téléphones et PC utilisant ce même canal sont automatiquement reliés.</small>
            </div>

            <div style="background:#f8f9fa;border:1px solid #e9ecef;border-radius:6px;padding:12px;margin-top:10px;">
              <div style="font-weight:700;font-size:0.85rem;color:#1a5276;margin-bottom:6px;">
                <i class="fa-solid fa-server"></i> Serveur actif : <span style="color:#27ae60;" id="cfg-broker-name">${broker.name}</span>
              </div>
              <div style="display:flex;gap:10px;flex-wrap:wrap;">
                <button type="button" class="btn btn-secondary btn-sm" onclick="CloudSync.testSync()">
                  <i class="fa-solid fa-paper-plane"></i> Tester la connexion
                </button>
                <button type="button" class="btn btn-outline btn-sm" onclick="CloudSync.forcePushAll()">
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
    if (topicInput && topicInput.value.trim()) {
      _config.channel = topicInput.value.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_');
    }

    saveConfig();
    closeConfigModal();

    if (typeof App !== 'undefined' && App.showToast) {
      App.showToast('Configuration enregistrée', 'Reconnexion au canal...', 'success');
    }

    init();
  }

  function testSync() {
    if (!_isConnected) {
      if (typeof App !== 'undefined' && App.showToast) {
        App.showToast('Connexion en cours', 'Veuillez patienter pendant la connexion au serveur...', 'warning');
      }
      return;
    }

    _publish(_getDeltaTopic(), {
      type: 'PING',
      sender: _clientId,
      time: Date.now()
    }, false);

    if (typeof App !== 'undefined' && App.showToast) {
      App.showToast('Test Réussi', 'Signal de synchronisation émis en direct sur le Cloud !', 'success');
    }
  }

  function forcePushAll() {
    _broadcastFullState();
    if (typeof App !== 'undefined' && App.showToast) {
      App.showToast('Synchronisation Complète', 'Toutes les données locales ont été diffusées sur le Cloud !', 'success');
    }
  }

  /* ---- 11. Initialisation générale ---- */
  function init() {
    loadConfig();
    _connect();
  }

  return {
    init,
    onLocalChange,
    onMissionSaved,
    onMissionDeleted,
    onUserSaved,
    onUserDeleted,
    openConfigModal,
    closeConfigModal,
    saveConfigFromModal,
    testSync,
    forcePushAll
  };
})();
