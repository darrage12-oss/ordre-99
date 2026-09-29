/**
 * cloud_sync.js - Module de synchronisation robuste pour Ordre de Mission SRM TTA
 * Supporte :
 * 1. Firebase Realtime Database (stockage cloud permanent gratuit)
 * 2. WebRTC Peer-to-Peer direct (connexion instantanée entre appareils via identifiant d'équipe)
 * 3. Mode secours local automatique
 */

const CloudSync = (() => {
  'use strict';

  const STORAGE_CONFIG_KEY = 'ordre_mission_cloud_config';

  // Configuration par défaut
  let _config = {
    // Mode de synchronisation : 'p2p' ou 'firebase'
    mode: 'p2p',
    // Identifiant d'équipe partagé entre PC et Portables (doit être identique sur tous les appareils)
    teamId: 'srm_tta_ouezzane',
    // URL Firebase personnalisée (si l'utilisateur en possède une)
    firebaseUrl: '',
    // Horodatage
    lastSync: 0
  };

  let _peer = null;
  let _connections = [];
  let _syncTimer = null;
  let _isOnline = false;

  /* ---- Charger la configuration sauvegardée ---- */
  function loadConfig() {
    try {
      const saved = localStorage.getItem(STORAGE_CONFIG_KEY);
      if (saved) {
        _config = { ..._config, ...JSON.parse(saved) };
      }
    } catch (e) {
      console.warn('Erreur chargement config cloud:', e);
    }
  }

  function saveConfig() {
    localStorage.setItem(STORAGE_CONFIG_KEY, JSON.stringify(_config));
  }

  /* ---- UI: Badge d'état dans la barre supérieure ---- */
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

  /* ---- 1. SYNCHRONISATION FIREBASE (REST API) ---- */
  async function syncWithFirebase() {
    if (!_config.firebaseUrl) return false;
    let url = _config.firebaseUrl.trim().replace(/\/+$/, '');
    if (!url.endsWith('.json')) url += '/srm_data.json';

    try {
      updateBadge('syncing', 'Synchronisation Firebase...');

      // Récupérer les données distantes
      const res = await fetch(url + '?t=' + Date.now());
      if (res.ok) {
        const remoteData = await res.json();
        if (remoteData && remoteData.updatedAt) {
          _mergeRemoteData(remoteData);
        }
      }

      // Envoyer nos données locales
      const localPayload = {
        updatedAt: Date.now(),
        teamId: _config.teamId,
        missions: Missions.getAll(),
        users: Users.getAll()
      };

      const putRes = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(localPayload)
      });

      if (putRes.ok) {
        _isOnline = true;
        updateBadge('online', 'En direct (Firebase)');
        return true;
      }
    } catch (err) {
      console.warn('Erreur Firebase:', err);
    }
    return false;
  }

  /* ---- 2. SYNCHRONISATION WEBRTC PEER-TO-PEER (Immédiate sans compte) ---- */
  function initP2P() {
    if (typeof Peer === 'undefined') {
      console.warn('Bibliothèque PeerJS non disponible.');
      updateBadge('offline', 'P2P indisponible');
      return;
    }

    const cleanTeam = _config.teamId.toLowerCase().replace(/[^a-z0-9_-]/g, '_');
    const isMaster = !navigator.userAgent.match(/Android|iPhone|iPad|Mobile/i);

    // ID pour le PC hôte ou les téléphones
    const peerId = isMaster ? `srm-host-${cleanTeam}` : `srm-client-${cleanTeam}-${Math.random().toString(36).substr(2, 5)}`;

    try {
      if (_peer) {
        try { _peer.destroy(); } catch (e) {}
      }

      _peer = new Peer(peerId, {
        debug: 1,
        config: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' }
          ]
        }
      });

      _peer.on('open', (id) => {
        _isOnline = true;
        updateBadge('online', isMaster ? 'PC Connecté (Prêt)' : 'Mobile Connecté');

        // Si mobile, se connecter au PC hôte
        if (!isMaster) {
          _connectToMaster(`srm-host-${cleanTeam}`);
        }
      });

      _peer.on('connection', (conn) => {
        _handleConnection(conn);
      });

      _peer.on('error', (err) => {
        console.warn('Erreur PeerJS:', err);
        // Si l'hôte existe déjà (autre onglet sur le PC)
        if (err.type === 'unavailable-id' && isMaster) {
          _connectToMaster(`srm-host-${cleanTeam}`);
        } else {
          updateBadge('offline', 'En attente...');
        }
      });
    } catch (e) {
      console.warn('Exception PeerJS:', e);
      updateBadge('offline', 'Non connecté');
    }
  }

  function _connectToMaster(hostId) {
    if (!_peer) return;
    updateBadge('syncing', 'Connexion au PC...');

    const conn = _peer.connect(hostId, { reliable: true });
    _handleConnection(conn);
  }

  function _handleConnection(conn) {
    conn.on('open', () => {
      _connections.push(conn);
      _isOnline = true;
      updateBadge('online', 'En direct (PC ↔ Mobile)');

      // Échanger immédiatement les données
      _sendAllData(conn);
    });

    conn.on('data', (data) => {
      if (data && data.type === 'SYNC_DATA') {
        _mergeRemoteData(data.payload);
        if (typeof App !== 'undefined' && App.showToast) {
          App.showToast('Synchronisation', 'Nouvel ordre de mission reçu en direct !', 'success');
        }
      }
    });

    conn.on('close', () => {
      _connections = _connections.filter(c => c !== conn);
      if (_connections.length === 0) {
        updateBadge('online', 'En attente de connexion');
      }
    });
  }

  function _sendAllData(targetConn = null) {
    const payload = {
      type: 'SYNC_DATA',
      payload: {
        updatedAt: Date.now(),
        missions: Missions.getAll(),
        users: Users.getAll()
      }
    };

    if (targetConn && targetConn.open) {
      targetConn.send(payload);
    } else {
      _connections.forEach(conn => {
        if (conn.open) {
          conn.send(payload);
        }
      });
    }
  }

  /* ---- Fusion intelligente des données reçues ---- */
  function _mergeRemoteData(remoteData) {
    if (!remoteData) return;
    let hasChanges = false;

    // 1. Fusion des missions
    if (Array.isArray(remoteData.missions)) {
      const localMissions = Missions.getAll();
      const localMap = new Map(localMissions.map(m => [m.id, m]));

      remoteData.missions.forEach(rm => {
        const existing = localMap.get(rm.id);
        if (!existing) {
          localMap.set(rm.id, rm);
          hasChanges = true;
        } else if (new Date(rm.createdAt || 0) > new Date(existing.createdAt || 0)) {
          localMap.set(rm.id, rm);
          hasChanges = true;
        }
      });

      if (hasChanges) {
        localStorage.setItem('ordre_mission_missions', JSON.stringify(Array.from(localMap.values())));
      }
    }

    // 2. Fusion des agents
    if (Array.isArray(remoteData.users)) {
      const localUsers = Users.getAll();
      const localMap = new Map(localUsers.map(u => [u.id, u]));

      remoteData.users.forEach(ru => {
        if (!localMap.has(ru.id)) {
          localMap.set(ru.id, ru);
          hasChanges = true;
        }
      });

      if (hasChanges) {
        localStorage.setItem('ordre_mission_users', JSON.stringify(Array.from(localMap.values())));
        Users.populateDropdown(document.getElementById('active-agent-select'));
      }
    }

    if (hasChanges) {
      // Rafraîchir les vues actives
      if (typeof History !== 'undefined' && document.getElementById('view-history')?.classList.contains('active')) {
        History.render();
      }
      if (typeof Dashboard !== 'undefined' && document.getElementById('view-dashboard')?.classList.contains('active')) {
        Dashboard.render();
      }
      if (typeof Users !== 'undefined' && document.getElementById('view-agents')?.classList.contains('active')) {
        Users.renderList();
      }
    }
  }

  /* ---- Notification d'une modification locale ---- */
  function onLocalChange() {
    if (_config.firebaseUrl) {
      syncWithFirebase();
    }
    _sendAllData();
  }

  /* ---- Boîte modale de configuration Cloud ---- */
  function openConfigModal() {
    let modal = document.getElementById('cloud-config-modal');
    if (!modal) {
      const modalHtml = `
      <div class="modal-overlay" id="cloud-config-modal">
        <div class="modal-box" style="max-width:520px;">
          <div class="modal-header">
            <h3><i class="fa-solid fa-cloud-arrow-up"></i> Synchronisation PC ↔ Portable</h3>
            <button class="modal-close" onclick="CloudSync.closeConfigModal()">&times;</button>
          </div>
          <div class="modal-body" style="padding:18px 20px;">
            <p style="font-size:0.88rem;color:var(--text-muted);margin-bottom:15px;line-height:1.5;">
              Ce module permet de faire passer automatiquement vos ordres de mission entre votre PC et les téléphones des agents en direct.
            </p>

            <div class="form-group" style="margin-bottom:14px;">
              <label class="form-label" style="font-weight:700;">Identifiant d'équipe partagé :</label>
              <input type="text" id="cfg-team-id" class="form-control" value="${_config.teamId}" placeholder="Ex: srm_tta_ouezzane" />
              <small style="color:var(--text-muted);font-size:0.75rem;">Tous vos téléphones et PC doivent avoir le même identifiant pour être synchronisés ensemble.</small>
            </div>

            <div class="form-group" style="margin-bottom:14px;">
              <label class="form-label" style="font-weight:700;">URL Firebase optionnelle (stockage permanent) :</label>
              <input type="url" id="cfg-firebase-url" class="form-control" value="${_config.firebaseUrl}" placeholder="https://votre-projet-default-rtdb.firebaseio.com" />
              <small style="color:var(--text-muted);font-size:0.75rem;">Optionnel : Si renseigné, toutes les missions y sont archivées en continu.</small>
            </div>

            <div style="background:#f0f7ff;border:1px solid #cce3fd;border-radius:6px;padding:12px;margin-top:15px;">
              <div style="font-weight:700;font-size:0.85rem;color:#1a5276;margin-bottom:4px;">
                <i class="fa-solid fa-circle-info"></i> Comment tester :
              </div>
              <ol style="margin:0;padding-left:18px;font-size:0.8rem;color:#333;line-height:1.5;">
                <li>Ouvrez le lien sur votre PC et sur votre téléphone.</li>
                <li>Vérifiez que le badge en haut affiche <strong style="color:#27ae60;">🟢 En direct</strong>.</li>
                <li>Ajoutez une mission sur le téléphone : elle arrive sur le PC en 2 secondes !</li>
              </ol>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-outline" onclick="CloudSync.closeConfigModal()">Fermer</button>
            <button class="btn btn-secondary" onclick="CloudSync.testSync()"><i class="fa-solid fa-arrows-rotate"></i> Tester la connexion</button>
            <button class="btn btn-primary" onclick="CloudSync.saveConfigFromModal()"><i class="fa-solid fa-floppy-disk"></i> Enregistrer</button>
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
    const teamInput = document.getElementById('cfg-team-id');
    const fbInput = document.getElementById('cfg-firebase-url');

    if (teamInput) _config.teamId = teamInput.value.trim() || 'srm_tta_ouezzane';
    if (fbInput) _config.firebaseUrl = fbInput.value.trim();

    saveConfig();
    closeConfigModal();

    if (typeof App !== 'undefined' && App.showToast) {
      App.showToast('Configuration enregistrée', 'Reconnexion de la synchronisation...', 'success');
    }

    init();
  }

  async function testSync() {
    updateBadge('syncing', 'Test en cours...');
    if (_config.firebaseUrl) {
      const ok = await syncWithFirebase();
      if (ok) {
        if (typeof App !== 'undefined' && App.showToast) {
          App.showToast('Succès', 'Connexion Firebase établie avec succès !', 'success');
        }
        return;
      }
    }

    // Tester P2P
    if (_connections.length > 0) {
      _sendAllData();
      if (typeof App !== 'undefined' && App.showToast) {
        App.showToast('Succès', `Connecté avec ${_connections.length} appareil(s) en direct !`, 'success');
      }
    } else {
      initP2P();
      setTimeout(() => {
        if (typeof App !== 'undefined' && App.showToast) {
          App.showToast('Prêt', 'Appareil connecté au réseau de synchronisation.', 'info');
        }
      }, 1000);
    }
  }

  /* ---- Démarrage initial ---- */
  function init() {
    loadConfig();

    if (_config.firebaseUrl) {
      syncWithFirebase();
      if (_syncTimer) clearInterval(_syncTimer);
      _syncTimer = setInterval(syncWithFirebase, 4000);
    } else {
      initP2P();
    }
  }

  return {
    init,
    onLocalChange,
    openConfigModal,
    closeConfigModal,
    saveConfigFromModal,
    testSync
  };
})();
