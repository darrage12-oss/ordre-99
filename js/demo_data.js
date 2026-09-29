/**
 * demo_data.js
 * Pre-populate localStorage with demo agents and missions
 * Only runs when data is completely absent
 */

(function initDemoData() {
  'use strict';

  const USERS_KEY    = 'ordre_mission_users';
  const MISSIONS_KEY = 'ordre_mission_missions';

  // Don't override if data already exists
  if (localStorage.getItem(USERS_KEY) && localStorage.getItem(MISSIONS_KEY)) {
    return;
  }

  /* ---- Demo Agents ---- */
  const demoUsers = [
    {
      id: 'u001',
      nom: 'DARRAGE Ayoub',
      matricule: '83 182 D',
      fonction: 'Conducteur de Travaux',
      direction: 'OUEZZANE',
      departement: 'Etude et Travaux',
      division: 'Etude et Travaux Réseaux Electricité',
      service: '',
      province: 'OUEZZANE'
    },
    {
      id: 'u002',
      nom: 'BENALI Fatima',
      matricule: '74 531 B',
      fonction: 'Ingénieure Réseau',
      direction: 'OUEZZANE',
      departement: 'Exploitation',
      division: 'Distribution Haute Tension',
      service: 'HTA/HTB',
      province: 'OUEZZANE'
    },
    {
      id: 'u003',
      nom: 'AMRANI Karim',
      matricule: '91 047 A',
      fonction: 'Technicien Supérieur',
      direction: 'OUEZZANE',
      departement: 'Maintenance',
      division: 'Maintenance Réseaux BT',
      service: 'Basse Tension',
      province: 'OUEZZANE'
    }
  ];

  /* ---- Helper: Generate mission number for demo ---- */
  function makeDemoNum(year, seq) {
    return `OM-${year}-${String(seq).padStart(4, '0')}`;
  }

  /* ---- Demo Missions (spread across 3 months) ---- */
  const now = new Date();
  const y   = now.getFullYear();

  // Build month strings for 3 months ago, 2 months ago, current month
  function monthStr(offset, day) {
    const d = new Date(y, now.getMonth() + offset, day);
    return d.toISOString().slice(0, 10);
  }

  const demoMissions = [
    // Month -2 (2 months ago)
    {
      id: 'm001',
      numero: makeDemoNum(y, 1),
      userId: 'u001',
      agent: { ...demoUsers[0] },
      lieuDeplacement: 'Casablanca',
      motifDeplacement: 'Réunion de coordination réseau avec la direction centrale',
      dateDepart: monthStr(-2, 5),
      heureDepart: '08:00',
      dateRetour: monthStr(-2, 6),
      heureRetour: '17:00',
      covoiturage: false,
      vehiculeService: true,
      vehiculeServiceNum: '45263-A-7',
      transportCommun: false,
      vehiculePerso: false,
      vehiculePersoMarque: '',
      puissanceFiscale: '',
      kilometrage: '320',
      lieuCreation: 'OUEZZANE',
      dateCreation: monthStr(-2, 4),
      createdAt: new Date(y, now.getMonth() - 2, 4).toISOString()
    },
    {
      id: 'm002',
      numero: makeDemoNum(y, 2),
      userId: 'u002',
      agent: { ...demoUsers[1] },
      lieuDeplacement: 'Rabat',
      motifDeplacement: 'Formation technique sur les équipements HTA nouvelle génération',
      dateDepart: monthStr(-2, 10),
      heureDepart: '07:30',
      dateRetour: monthStr(-2, 12),
      heureRetour: '18:00',
      covoiturage: false,
      vehiculeService: false,
      vehiculeServiceNum: '',
      transportCommun: true,
      vehiculePerso: false,
      vehiculePersoMarque: '',
      puissanceFiscale: '',
      kilometrage: '',
      lieuCreation: 'OUEZZANE',
      dateCreation: monthStr(-2, 9),
      createdAt: new Date(y, now.getMonth() - 2, 9).toISOString()
    },

    // Month -1 (last month)
    {
      id: 'm003',
      numero: makeDemoNum(y, 3),
      userId: 'u001',
      agent: { ...demoUsers[0] },
      lieuDeplacement: 'Kénitra',
      motifDeplacement: 'Contrôle et réception des travaux d\'extension réseau BT',
      dateDepart: monthStr(-1, 8),
      heureDepart: '08:30',
      dateRetour: monthStr(-1, 8),
      heureRetour: '16:00',
      covoiturage: true,
      vehiculeService: false,
      vehiculeServiceNum: '',
      transportCommun: false,
      vehiculePerso: false,
      vehiculePersoMarque: '',
      puissanceFiscale: '',
      kilometrage: '',
      lieuCreation: 'OUEZZANE',
      dateCreation: monthStr(-1, 7),
      createdAt: new Date(y, now.getMonth() - 1, 7).toISOString()
    },
    {
      id: 'm004',
      numero: makeDemoNum(y, 4),
      userId: 'u003',
      agent: { ...demoUsers[2] },
      lieuDeplacement: 'Larache',
      motifDeplacement: 'Intervention maintenance préventive postes de transformation',
      dateDepart: monthStr(-1, 15),
      heureDepart: '07:00',
      dateRetour: monthStr(-1, 17),
      heureRetour: '15:30',
      covoiturage: false,
      vehiculeService: false,
      vehiculeServiceNum: '',
      transportCommun: false,
      vehiculePerso: true,
      vehiculePersoMarque: 'Dacia Duster',
      puissanceFiscale: '7',
      kilometrage: '180',
      lieuCreation: 'OUEZZANE',
      dateCreation: monthStr(-1, 14),
      createdAt: new Date(y, now.getMonth() - 1, 14).toISOString()
    },
    {
      id: 'm005',
      numero: makeDemoNum(y, 5),
      userId: 'u002',
      agent: { ...demoUsers[1] },
      lieuDeplacement: 'Tétouan',
      motifDeplacement: 'Audit technique du réseau de distribution HTA/BT',
      dateDepart: monthStr(-1, 22),
      heureDepart: '09:00',
      dateRetour: monthStr(-1, 23),
      heureRetour: '17:00',
      covoiturage: false,
      vehiculeService: true,
      vehiculeServiceNum: '38140-A-7',
      transportCommun: false,
      vehiculePerso: false,
      vehiculePersoMarque: '',
      puissanceFiscale: '',
      kilometrage: '210',
      lieuCreation: 'OUEZZANE',
      dateCreation: monthStr(-1, 21),
      createdAt: new Date(y, now.getMonth() - 1, 21).toISOString()
    },

    // Current month
    {
      id: 'm006',
      numero: makeDemoNum(y, 6),
      userId: 'u001',
      agent: { ...demoUsers[0] },
      lieuDeplacement: 'Meknès',
      motifDeplacement: 'Réunion bilan trimestriel et planification travaux Q4',
      dateDepart: monthStr(0, 10),
      heureDepart: '08:00',
      dateRetour: monthStr(0, 11),
      heureRetour: '16:00',
      covoiturage: false,
      vehiculeService: true,
      vehiculeServiceNum: '45263-A-7',
      transportCommun: false,
      vehiculePerso: false,
      vehiculePersoMarque: '',
      puissanceFiscale: '',
      kilometrage: '260',
      lieuCreation: 'OUEZZANE',
      dateCreation: monthStr(0, 9),
      createdAt: new Date(y, now.getMonth(), 9).toISOString()
    }
  ];

  /* ---- Set counters ---- */
  const counterKey = `ordre_mission_counter_${y}`;
  if (!localStorage.getItem(counterKey)) {
    localStorage.setItem(counterKey, '6'); // 6 missions created
  }

  /* ---- Persist ---- */
  if (!localStorage.getItem(USERS_KEY)) {
    localStorage.setItem(USERS_KEY, JSON.stringify(demoUsers));
  }

  if (!localStorage.getItem(MISSIONS_KEY)) {
    localStorage.setItem(MISSIONS_KEY, JSON.stringify(demoMissions));
  }

  console.log('[DemoData] Demo data loaded into localStorage.');
})();
