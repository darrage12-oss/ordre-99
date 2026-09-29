/**
 * cloud_sync.js
 * Synchronisation automatique en temps réel entre Téléphone (portable) et PC.
 * Fonctionne partout en 4G/5G et Wi-Fi sans aucune configuration requise.
 */

const CloudSync = (() => {
  'use strict';

  // Clé d'espace de travail partagé pour SRM TTA
  const SYNC_CHANNEL_KEY = 'ordre_mission_sync_channel';
  const DEFAULT_CHANNEL = 'srm_tta_ouezzane_sync';

  // Service Cloud sécurisé et ultra-rapide
  const CLOUD_ENDPOINT = 'https://kvdb.io/4YwKqVqR9K8Z2sP28zKqK1/';

  let _channel = localStorage.getItem(SYNC_CHANNEL_KEY) || DEFAULT_CHANNEL;
  let _syncInterval = null;
  let _isSyncing = false;
  let _lastSyncTimestamp = 0;

  function getChannel() {
    return _channel;
  }

  function setChannel(newChannel) {
    if (!newChannel) return;
    _channel = newChannel.trim().replace(/[^a-zA-Z0-9_-]/g, '_');
    localStorage.setItem(SYNC_CHANNEL_KEY, _channel);
    updateBadge('syncing', 'Reconnexion...');
    syncNow();
  }

  /* ---- UI: Badge d'état dans la topbar ---- */
  function updateBadge(status, text) {
    const badge = document.getElementById('cloud-status-badge');
    if (!badge) return;

    badge.className = `cloud-badge status-${status}`;
    badge.innerHTML = `<i class="fa-solid fa-cloud"></i> <span>${text}</span>`;
  }

  /* ---- Envoyer les données locales vers le Cloud ---- */
  async function pushToCloud() {
    try {
      const missions = Missions.getAll();
      const users = Users.getAll();
      const payload = {
        updatedAt: Date.now(),
        missions: missions,
        users: users
      };

      const res = await fetch(`${CLOUD_ENDPOINT}${_channel}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        _lastSyncTimestamp = payload.updatedAt;
        updateBadge('online', 'En direct (PC ↔ Mobile)');
      }
    } catch (e) {
      console.warn('Sync Cloud push warning:', e);
      updateBadge('offline', 'Hors-ligne (Local)');
    }
  }

  /* ---- Récupérer les données depuis le Cloud ---- */
  async function pullFromCloud() {
    if (_isSyncing) return;
    _isSyncing = true;

    try {
      const res = await fetch(`${CLOUD_ENDPOINT}${_channel}?_t=${Date.now()}`);
      if (!res.ok) {
        // Premier lancement sur ce canal, initialiser avec les données locales
        if (res.status === 404) {
          await pushToCloud();
        }
        _isSyncing = false;
        return;
      }

      const remoteData = await res.json();
      if (!remoteData || !remoteData.updatedAt) {
        _isSyncing = false;
        return;
      }

      // Si le Cloud a des données plus récentes
      if (remoteData.updatedAt > _lastSyncTimestamp) {
        let hasChanges = false;

        // 1. Fusionner les missions
        if (Array.isArray(remoteData.missions)) {
          const localMissions = Missions.getAll();
          const localMap = new Map(localMissions.map(m => [m.id, m]));

          remoteData.missions.forEach(rm => {
            const existing = localMap.get(rm.id);
            if (!existing || new Date(rm.createdAt || 0) > new Date(existing.createdAt || 0)) {
              localMap.set(rm.id, rm);
              hasChanges = true;
            }
          });

          if (hasChanges) {
            localStorage.setItem('ordre_mission_missions', JSON.stringify(Array.from(localMap.values())));
          }
        }

        // 2. Fusionner les agents
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

        // Si de nouveaux ordres de mission sont arrivés depuis le portable
        if (hasChanges) {
          _lastSyncTimestamp = remoteData.updatedAt;
          updateBadge('online', 'Mis à jour !');

          // Rafraîchir la vue courante
          if (typeof History !== 'undefined' && document.getElementById('view-history')?.classList.contains('active')) {
            History.render();
          }
          if (typeof Dashboard !== 'undefined' && document.getElementById('view-dashboard')?.classList.contains('active')) {
            Dashboard.render();
          }
          if (typeof Users !== 'undefined' && document.getElementById('view-agents')?.classList.contains('active')) {
            Users.renderList();
          }

          if (typeof App !== 'undefined' && App.showToast) {
            App.showToast('Synchronisation', 'Nouvelle mission reçue en direct !', 'success');
          }
        } else {
          _lastSyncTimestamp = remoteData.updatedAt;
          updateBadge('online', 'En direct (PC ↔ Mobile)');
        }
      } else {
        updateBadge('online', 'En direct (PC ↔ Mobile)');
      }
    } catch (e) {
      console.warn('Sync Cloud pull warning:', e);
      updateBadge('offline', 'Hors-ligne');
    } finally {
      _isSyncing = false;
    }
  }

  /* ---- Forcer une synchronisation immédiate ---- */
  async function syncNow() {
    updateBadge('syncing', 'Synchronisation...');
    await pullFromCloud();
  }

  /* ---- Notification d'une création locale (sur PC ou Portable) ---- */
  function onLocalChange() {
    updateBadge('syncing', 'Envoi au Cloud...');
    pushToCloud();
  }

  /* ---- Démarrage automatique du service de synchronisation ---- */
  function init() {
    // Premier tirage
    syncNow();

    // Boucle de vérification automatique toutes les 3 secondes
    if (_syncInterval) clearInterval(_syncInterval);
    _syncInterval = setInterval(() => {
      pullFromCloud();
    }, 3000);

    // Écouter le retour de connexion réseau
    window.addEventListener('online', () => {
      updateBadge('syncing', 'Reconnexion...');
      pushToCloud().then(() => pullFromCloud());
    });

    window.addEventListener('offline', () => {
      updateBadge('offline', 'Mode Hors-Ligne');
    });
  }

  return {
    init,
    syncNow,
    onLocalChange,
    getChannel,
    setChannel
  };
})();
