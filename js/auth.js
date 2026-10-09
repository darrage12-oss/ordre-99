/**
 * auth.js - Module d'authentification et de confidentialité des données SRM TTA
 * - Connexion obligatoire par Matricule + Mot de passe
 * - Mode de récupération de mot de passe par Gmail
 * - Confidentialité stricte : chaque agent ne voit que son propre historique
 * - Rôle Administrateur : vue complète sur l'ensemble des agents et missions
 */

const Auth = (() => {
  'use strict';

  const SESSION_KEY = 'ordre_mission_current_session';

  /* ---- Nettoyage / normalisation d'un matricule ---- */
  function normalizeMatricule(mat) {
    return String(mat || '').toUpperCase().replace(/\s+/g, ' ').trim();
  }

  function compactMatricule(mat) {
    return String(mat || '').toUpperCase().replace(/\s+/g, '');
  }

  /* ---- Migration automatique des agents existants pour leur assigner mot de passe et email ---- */
  function _ensureAgentsHaveAuthData() {
    try {
      const users = Users.getAll();
      let changed = false;

      // 1. S'assurer que le compte Direction / Admin existe
      const hasAdmin = users.some(u => compactMatricule(u.matricule) === 'ADMIN');
      if (!hasAdmin) {
        users.push({
          id: 'u_admin_srm',
          nom: 'Direction Provinciale SRM TTA',
          matricule: 'ADMIN',
          fonction: 'Directeur Provincial',
          direction: 'OUEZZANE',
          departement: 'Direction',
          division: 'Direction Provinciale',
          service: 'Direction',
          province: 'OUEZZANE',
          email: 'direction.srm.ouezzane@gmail.com',
          password: 'admin',
          role: 'admin'
        });
        changed = true;
      }

      // 2. Assurer que chaque agent a un mot de passe (défaut '1234') et un email de récupération
      users.forEach(u => {
        if (!u.password) {
          u.password = '1234';
          changed = true;
        }
        if (!u.email) {
          const cleanNom = (u.nom || 'agent').toLowerCase().replace(/[^a-z0-9]/g, '.').replace(/\.+/g, '.');
          u.email = `${cleanNom}@gmail.com`;
          changed = true;
        }
        if (!u.role) {
          u.role = compactMatricule(u.matricule) === 'ADMIN' ? 'admin' : 'agent';
          changed = true;
        }
      });

      if (changed) {
        localStorage.setItem('ordre_mission_users', JSON.stringify(users));
      }
    } catch (e) {
      console.warn('[Auth] Erreur migration agents:', e);
    }
  }

  /* ---- Session courante ---- */
  function getCurrentUser() {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      const session = JSON.parse(raw);
      // Toujours rafraîchir avec les données à jour du stockage
      const user = Users.getById(session.id);
      return user || session;
    } catch {
      return null;
    }
  }

  function isLoggedIn() {
    return getCurrentUser() !== null;
  }

  function isAdmin() {
    const u = getCurrentUser();
    return u && (u.role === 'admin' || compactMatricule(u.matricule) === 'ADMIN');
  }

  /* ---- Connexion ---- */
  function login(matriculeInput, passwordInput) {
    _ensureAgentsHaveAuthData();

    const matComp = compactMatricule(matriculeInput);
    const pass = String(passwordInput || '').trim();

    if (!matComp) {
      return { success: false, error: 'Veuillez saisir votre Matricule.' };
    }
    if (!pass) {
      return { success: false, error: 'Veuillez saisir votre mot de passe.' };
    }

    const users = Users.getAll();
    const user = users.find(u => compactMatricule(u.matricule) === matComp);

    if (!user) {
      return { success: false, error: 'Matricule introuvable. Vérifiez votre matricule ou inscrivez-vous.' };
    }

    // Vérifier mot de passe
    const storedPass = String(user.password || '1234').trim();
    if (storedPass !== pass) {
      return { success: false, error: 'Mot de passe incorrect pour ce matricule.' };
    }

    // Connexion réussie
    _setSession(user);
    return { success: true, user };
  }

  function _setSession(user) {
    localStorage.setItem(SESSION_KEY, JSON.stringify(user));
    Users.setActiveUser(user.id);

    // Mettre à jour l'interface
    updateUIForSession();

    // Masquer l'écran de connexion
    hideLoginModal();

    // Notifier
    if (typeof App !== 'undefined' && App.showToast) {
      const roleTxt = user.role === 'admin' ? ' (Administrateur)' : '';
      App.showToast('Connexion Réussie', `Bienvenue, ${user.nom}${roleTxt} !`, 'success');
    }

    // Rafraîchir les vues selon le profil
    if (typeof App !== 'undefined') {
      const activeNav = document.querySelector('.nav-item.active');
      const view = activeNav ? activeNav.dataset.view : 'dashboard';
      App.switchView(view || 'dashboard');
    }
  }

  /* ---- Déconnexion ---- */
  function logout() {
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem('ordre_mission_active_user');

    updateUIForSession();
    showLoginModal();

    if (typeof App !== 'undefined' && App.showToast) {
      App.showToast('Déconnexion', 'Vous avez été déconnecté avec succès.', 'info');
    }
  }

  /* ---- Inscription / Premier compte ---- */
  function register(data) {
    _ensureAgentsHaveAuthData();

    const mat = normalizeMatricule(data.matricule);
    const matComp = compactMatricule(mat);

    if (!matComp) {
      return { success: false, error: 'Le Matricule est obligatoire.' };
    }
    if (!data.nom || !data.nom.trim()) {
      return { success: false, error: 'Le nom et prénom sont obligatoires.' };
    }
    if (!data.email || !data.email.trim() || !data.email.includes('@')) {
      return { success: false, error: 'Veuillez fournir une adresse Gmail de récupération valide.' };
    }
    if (!data.password || data.password.trim().length < 4) {
      return { success: false, error: 'Le mot de passe doit comporter au moins 4 caractères.' };
    }

    // Vérifier doublon
    const users = Users.getAll();
    if (users.some(u => compactMatricule(u.matricule) === matComp)) {
      return { success: false, error: 'Ce Matricule existe déjà. Veuillez vous connecter ou utiliser la récupération.' };
    }

    const newUser = {
      nom: data.nom.trim(),
      matricule: mat,
      fonction: (data.fonction || '').trim(),
      direction: (data.direction || 'OUEZZANE').trim(),
      departement: (data.departement || '').trim(),
      division: (data.division || '').trim(),
      service: (data.service || '').trim(),
      province: (data.province || 'OUEZZANE').trim(),
      email: data.email.trim().toLowerCase(),
      password: data.password.trim(),
      role: 'agent'
    };

    const saved = Users.save(newUser);
    _setSession(saved);

    return { success: true, user: saved };
  }

  /* ---- Récupération via Gmail (Mot de passe oublié) ---- */
  function verifyRecovery(matriculeInput, emailInput) {
    _ensureAgentsHaveAuthData();

    const matComp = compactMatricule(matriculeInput);
    const email = String(emailInput || '').trim().toLowerCase();

    if (!matComp) {
      return { success: false, error: 'Veuillez saisir votre Matricule.' };
    }
    if (!email) {
      return { success: false, error: 'Veuillez saisir votre adresse Gmail de récupération.' };
    }

    const users = Users.getAll();
    const user = users.find(u => compactMatricule(u.matricule) === matComp);

    if (!user) {
      return { success: false, error: 'Matricule introuvable dans le système.' };
    }

    const userEmail = String(user.email || '').trim().toLowerCase();
    if (userEmail !== email) {
      return { success: false, error: 'L\'adresse Gmail ne correspond pas au compte de ce Matricule.' };
    }

    return { success: true, user };
  }

  function resetPassword(matriculeInput, emailInput, newPassword) {
    const check = verifyRecovery(matriculeInput, emailInput);
    if (!check.success) return check;

    const pass = String(newPassword || '').trim();
    if (!pass || pass.length < 4) {
      return { success: false, error: 'Le nouveau mot de passe doit comporter au moins 4 caractères.' };
    }

    const user = check.user;
    user.password = pass;
    Users.save(user);

    return { success: true, message: 'Mot de passe réinitialisé avec succès ! Vous pouvez maintenant vous connecter.' };
  }

  /* ---- Mise à jour de l'UI selon le rôle et l'état de connexion ---- */
  function updateUIForSession() {
    const user = getCurrentUser();
    const sessionWrap = document.getElementById('user-session-wrap');
    const legacyAgentWrap = document.querySelector('.agent-select-wrap');
    const navAgentsItem = document.querySelector('.nav-item[data-view="agents"]');

    if (!user) {
      // Non connecté
      if (sessionWrap) sessionWrap.style.display = 'none';
      if (legacyAgentWrap) legacyAgentWrap.style.display = 'none';
      return;
    }

    // Masquer le selecteur général pour les agents simples afin d'éviter d'usurper un autre agent
    if (legacyAgentWrap) {
      legacyAgentWrap.style.display = isAdmin() ? 'flex' : 'none';
    }

    // Afficher le badge de session personnalisé
    if (sessionWrap) {
      sessionWrap.style.display = 'inline-flex';
      const matEl = document.getElementById('session-user-matricule');
      const nameEl = document.getElementById('session-user-name');
      const roleEl = document.getElementById('session-user-role');

      if (matEl) matEl.textContent = user.matricule || '–';
      if (nameEl) nameEl.textContent = user.nom ? `(${user.nom})` : '';
      if (roleEl) {
        if (isAdmin()) {
          roleEl.innerHTML = '<span class="badge-role admin"><i class="fa-solid fa-shield-halved"></i> Admin</span>';
        } else {
          roleEl.innerHTML = '<span class="badge-role agent"><i class="fa-solid fa-id-badge"></i> Personnel</span>';
        }
      }
    }

    // Personnaliser le libellé du menu Agents :
    // Pour un agent simple -> "Mon Profil"
    // Pour un admin -> "Gestion des Agents"
    if (navAgentsItem) {
      const span = navAgentsItem.querySelector('span');
      const icon = navAgentsItem.querySelector('i');
      if (isAdmin()) {
        if (span) span.textContent = 'Gestion des Agents';
        if (icon) icon.className = 'fa-solid fa-users-cog';
      } else {
        if (span) span.textContent = 'Mon Profil';
        if (icon) icon.className = 'fa-solid fa-user-circle';
      }
    }

    // Libellé de l'onglet dans la barre mobile inférieure
    const mobAgentLabel = document.getElementById('mob-nav-agents-label');
    if (mobAgentLabel) {
      mobAgentLabel.textContent = isAdmin() ? 'Agents' : 'Mon Profil';
    }

    // Titre de la vue agents
    const agentViewTitle = document.querySelector('#view-agents .view-header h2');
    if (agentViewTitle) {
      agentViewTitle.innerHTML = isAdmin()
        ? '<i class="fa-solid fa-users-cog"></i> Gestion des Agents & Accès Sécurité'
        : '<i class="fa-solid fa-user-circle"></i> Mon Profil Personnel';
    }

    // Filtrer automatiquement les sélecteurs
    const histFilter = document.getElementById('hist-filter-agent');
    if (histFilter) {
      if (!isAdmin()) {
        histFilter.parentElement.style.display = 'none';
      } else {
        histFilter.parentElement.style.display = 'flex';
      }
    }

    // Rafraîchir l'affichage de la liste des agents selon le profil connecté
    if (typeof Users !== 'undefined' && typeof Users.renderList === 'function') {
      Users.renderList();
    }
  }

  /* ---- Modale de Connexion / Inscription / Récupération ---- */
  function showLoginModal(initialTab = 'login') {
    let modal = document.getElementById('auth-modal');
    if (!modal) {
      _createAuthModal();
      modal = document.getElementById('auth-modal');
    }
    if (modal) {
      modal.classList.add('open');
      switchAuthTab(initialTab);
    }
  }

  function hideLoginModal() {
    const modal = document.getElementById('auth-modal');
    if (modal) modal.classList.remove('open');
  }

  function switchAuthTab(tab) {
    const tabs = ['login', 'register', 'recovery'];
    tabs.forEach(t => {
      const pane = document.getElementById(`auth-tab-${t}`);
      const btn = document.getElementById(`auth-nav-${t}`);
      if (pane) pane.style.display = (t === tab) ? 'block' : 'none';
      if (btn) btn.classList.toggle('active', t === tab);
    });
    // Réinitialiser messages d'alerte
    const alertEl = document.getElementById('auth-alert');
    if (alertEl) alertEl.style.display = 'none';
  }

  function showAuthAlert(msg, type = 'danger') {
    const alertEl = document.getElementById('auth-alert');
    if (!alertEl) return;
    alertEl.className = `auth-alert alert-${type}`;
    alertEl.innerHTML = `<i class="fa-solid fa-${type === 'danger' ? 'triangle-exclamation' : 'circle-check'}"></i> ${msg}`;
    alertEl.style.display = 'block';
  }

  /* ---- Construction du HTML de la modale d'authentification ---- */
  function _createAuthModal() {
    const html = `
    <div class="modal-overlay auth-overlay open" id="auth-modal">
      <div class="modal-box auth-box">
        <div class="auth-header">
          <div class="auth-brand">
            <img src="assets/logo.png" alt="Logo SRM TTA" class="auth-logo" />
            <div class="auth-brand-text">
              <div class="auth-brand-title">SRM TTA</div>
              <div class="auth-brand-sub">Direction Provinciale d'Ouezzane</div>
            </div>
          </div>
          <div class="auth-badge-title">Espace Personnel & Sécurisé</div>
        </div>

        <!-- Onglets Navigation -->
        <div class="auth-nav">
          <button type="button" class="auth-nav-btn active" id="auth-nav-login" onclick="Auth.switchAuthTab('login')">
            <i class="fa-solid fa-right-to-bracket"></i> Connexion
          </button>
          <button type="button" class="auth-nav-btn" id="auth-nav-register" onclick="Auth.switchAuthTab('register')">
            <i class="fa-solid fa-user-plus"></i> Nouveau Compte
          </button>
          <button type="button" class="auth-nav-btn" id="auth-nav-recovery" onclick="Auth.switchAuthTab('recovery')">
            <i class="fa-solid fa-envelope"></i> Récupération Gmail
          </button>
        </div>

        <div id="auth-alert" class="auth-alert" style="display:none;"></div>

        <div class="auth-body">
          <!-- 1. TAB CONNEXION -->
          <div id="auth-tab-login">
            <form id="form-login" onsubmit="event.preventDefault(); Auth.submitLogin();">
              <div class="form-group" style="margin-bottom:14px;">
                <label class="form-label" style="font-weight:700;">
                  <i class="fa-solid fa-id-card"></i> Identifiant (Votre Matricule) :
                </label>
                <input type="text" id="login-matricule" class="form-control" placeholder="Ex: 83 182 D" required autocomplete="username" />
              </div>

              <div class="form-group" style="margin-bottom:16px;">
                <div style="display:flex;justify-content:space-between;align-items:center;">
                  <label class="form-label" style="font-weight:700;">
                    <i class="fa-solid fa-lock"></i> Mot de passe :
                  </label>
                  <a href="javascript:void(0)" onclick="Auth.switchAuthTab('recovery')" style="font-size:0.78rem;color:var(--primary);text-decoration:none;">Mot de passe oublié ?</a>
                </div>
                <div style="position:relative;">
                  <input type="password" id="login-password" class="form-control" placeholder="••••••••" required autocomplete="current-password" />
                  <button type="button" class="btn-toggle-pass" onclick="Auth.togglePassVisibility('login-password')">
                    <i class="fa-solid fa-eye"></i>
                  </button>
                </div>
              </div>

              <button type="submit" class="btn btn-primary btn-block" style="padding:11px;font-size:0.98rem;font-weight:700;width:100%;">
                <i class="fa-solid fa-arrow-right-to-bracket"></i> Accéder à mes ordres de mission
              </button>
            </form>

            <div class="auth-quick-demo">
              <span style="font-size:0.75rem;color:var(--text-muted);display:block;margin-bottom:6px;">Accès rapide pour tester :</span>
              <div style="display:flex;gap:8px;flex-wrap:wrap;">
                <button type="button" class="btn btn-xs btn-outline" onclick="Auth.fillDemo('83 182 D', '1234')">
                  👤 Agent: 83 182 D
                </button>
                <button type="button" class="btn btn-xs btn-outline" onclick="Auth.fillDemo('74 531 B', '1234')">
                  👤 Agent: 74 531 B
                </button>
                <button type="button" class="btn btn-xs btn-secondary" onclick="Auth.fillDemo('ADMIN', 'admin')">
                  🛡️ Direction / Admin
                </button>
              </div>
            </div>
          </div>

          <!-- 2. TAB INSCRIPTION / PREMIER COMPTE -->
          <div id="auth-tab-register" style="display:none;">
            <form id="form-register" onsubmit="event.preventDefault(); Auth.submitRegister();">
              <div class="form-row" style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
                <div class="form-group">
                  <label class="form-label" style="font-weight:700;">Matricule :</label>
                  <input type="text" id="reg-matricule" class="form-control" placeholder="Ex: 83 182 D" required />
                </div>
                <div class="form-group">
                  <label class="form-label" style="font-weight:700;">Nom et prénom :</label>
                  <input type="text" id="reg-nom" class="form-control" placeholder="Ex: DARRAGE Ayoub" required />
                </div>
              </div>

              <div class="form-row" style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px;">
                <div class="form-group">
                  <label class="form-label">Fonction :</label>
                  <input type="text" id="reg-fonction" class="form-control" placeholder="Ex: Conducteur de Travaux" />
                </div>
                <div class="form-group">
                  <label class="form-label">Département :</label>
                  <input type="text" id="reg-departement" class="form-control" placeholder="Ex: Etude et Travaux" />
                </div>
              </div>

              <div class="form-group" style="margin-top:10px;">
                <label class="form-label" style="font-weight:700;color:#c0392b;">
                  <i class="fa-solid fa-envelope"></i> Email Gmail de récupération (Obligatoire) :
                </label>
                <input type="email" id="reg-email" class="form-control" placeholder="votre.nom@gmail.com" required />
                <small style="color:var(--text-muted);font-size:0.75rem;">Utilisé exclusivement pour récupérer votre mot de passe en cas d'oubli.</small>
              </div>

              <div class="form-row" style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px;">
                <div class="form-group">
                  <label class="form-label" style="font-weight:700;">Mot de passe :</label>
                  <input type="password" id="reg-pass" class="form-control" placeholder="Min. 4 car." required />
                </div>
                <div class="form-group">
                  <label class="form-label" style="font-weight:700;">Confirmation :</label>
                  <input type="password" id="reg-pass-confirm" class="form-control" placeholder="Répéter mot de passe" required />
                </div>
              </div>

              <button type="submit" class="btn btn-success btn-block" style="padding:11px;font-size:0.95rem;font-weight:700;width:100%;margin-top:16px;">
                <i class="fa-solid fa-user-check"></i> Créer mon profil personnel
              </button>
            </form>
          </div>

          <!-- 3. TAB RÉCUPÉRATION GMAIL -->
          <div id="auth-tab-recovery" style="display:none;">
            <p style="font-size:0.85rem;color:var(--text-muted);margin-bottom:14px;line-height:1.4;">
              Indiquez votre matricule et votre adresse Gmail enregistrée pour réinitialiser instantanément votre mot de passe.
            </p>

            <form id="form-recovery" onsubmit="event.preventDefault(); Auth.submitRecovery();">
              <div class="form-group" style="margin-bottom:12px;">
                <label class="form-label" style="font-weight:700;">Votre Matricule :</label>
                <input type="text" id="rec-matricule" class="form-control" placeholder="Ex: 83 182 D" required />
              </div>

              <div class="form-group" style="margin-bottom:12px;">
                <label class="form-label" style="font-weight:700;">Votre adresse Gmail de récupération :</label>
                <input type="email" id="rec-email" class="form-control" placeholder="Ex: ayoub.darrage@gmail.com" required />
              </div>

              <div id="rec-step-pass" style="display:none;background:#f0f9ff;border:1px solid #bae6fd;padding:12px;border-radius:6px;margin-bottom:12px;">
                <div style="font-weight:700;font-size:0.85rem;color:#0369a1;margin-bottom:8px;">
                  <i class="fa-solid fa-circle-check" style="color:#0284c7;"></i> Identité confirmée via Gmail ! Définissez votre nouveau mot de passe :
                </div>
                <div class="form-group" style="margin-bottom:8px;">
                  <label class="form-label">Nouveau mot de passe :</label>
                  <input type="password" id="rec-new-pass" class="form-control" placeholder="Nouveau mot de passe" />
                </div>
                <div class="form-group">
                  <label class="form-label">Confirmer :</label>
                  <input type="password" id="rec-new-pass-confirm" class="form-control" placeholder="Répéter nouveau mot de passe" />
                </div>
              </div>

              <button type="submit" id="btn-rec-submit" class="btn btn-primary btn-block" style="padding:11px;font-size:0.95rem;font-weight:700;width:100%;">
                <i class="fa-solid fa-magnifying-glass"></i> Vérifier mon adresse Gmail
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>`;

    document.body.insertAdjacentHTML('beforeend', html);
  }

  function togglePassVisibility(inputId) {
    const input = document.getElementById(inputId);
    if (!input) return;
    input.type = input.type === 'password' ? 'text' : 'password';
  }

  function fillDemo(matricule, pass) {
    const matEl = document.getElementById('login-matricule');
    const passEl = document.getElementById('login-password');
    if (matEl) matEl.value = matricule;
    if (passEl) passEl.value = pass;
    submitLogin();
  }

  /* ---- Soumission formulaires ---- */
  function submitLogin() {
    const mat = document.getElementById('login-matricule')?.value;
    const pass = document.getElementById('login-password')?.value;
    const res = login(mat, pass);
    if (!res.success) {
      showAuthAlert(res.error, 'danger');
    }
  }

  function submitRegister() {
    const data = {
      matricule: document.getElementById('reg-matricule')?.value,
      nom: document.getElementById('reg-nom')?.value,
      fonction: document.getElementById('reg-fonction')?.value,
      departement: document.getElementById('reg-departement')?.value,
      email: document.getElementById('reg-email')?.value,
      password: document.getElementById('reg-pass')?.value
    };
    const passConf = document.getElementById('reg-pass-confirm')?.value;

    if (data.password !== passConf) {
      showAuthAlert('Les mots de passe ne correspondent pas.', 'danger');
      return;
    }

    const res = register(data);
    if (!res.success) {
      showAuthAlert(res.error, 'danger');
    }
  }

  let _verifiedUserForReset = null;

  function submitRecovery() {
    const mat = document.getElementById('rec-matricule')?.value;
    const email = document.getElementById('rec-email')?.value;
    const stepPass = document.getElementById('rec-step-pass');
    const btnSubmit = document.getElementById('btn-rec-submit');

    // Étape 1 : Vérification de l'adresse Gmail
    if (!stepPass || stepPass.style.display === 'none') {
      const check = verifyRecovery(mat, email);
      if (!check.success) {
        showAuthAlert(check.error, 'danger');
        return;
      }

      _verifiedUserForReset = check.user;
      stepPass.style.display = 'block';
      showAuthAlert('Identité vérifiée avec succès. Vous pouvez maintenant choisir un nouveau mot de passe.', 'success');
      btnSubmit.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Enregistrer le nouveau mot de passe';
      return;
    }

    // Étape 2 : Enregistrement du nouveau mot de passe
    const newPass = document.getElementById('rec-new-pass')?.value;
    const newPassConf = document.getElementById('rec-new-pass-confirm')?.value;

    if (!newPass || newPass.length < 4) {
      showAuthAlert('Le nouveau mot de passe doit comporter au moins 4 caractères.', 'danger');
      return;
    }
    if (newPass !== newPassConf) {
      showAuthAlert('Les deux mots de passe ne correspondent pas.', 'danger');
      return;
    }

    const res = resetPassword(mat, email, newPass);
    if (!res.success) {
      showAuthAlert(res.error, 'danger');
      return;
    }

    showAuthAlert('Mot de passe mis à jour avec succès ! Connexion automatique en cours...', 'success');
    setTimeout(() => {
      login(mat, newPass);
    }, 1200);
  }

  /* ---- Initialisation ---- */
  function init() {
    _ensureAgentsHaveAuthData();

    const user = getCurrentUser();
    if (!user) {
      showLoginModal('login');
    } else {
      updateUIForSession();
    }
  }

  return {
    init,
    getCurrentUser,
    isLoggedIn,
    isAdmin,
    login,
    logout,
    register,
    verifyRecovery,
    resetPassword,
    updateUIForSession,
    showLoginModal,
    hideLoginModal,
    switchAuthTab,
    togglePassVisibility,
    fillDemo,
    submitLogin,
    submitRegister,
    submitRecovery
  };
})();
