/**
 * pdf.js
 * Générateur conforme à 100% au modèle officiel Direction Provinciale SRM TTA
 * Reproduction exacte du formulaire A4 (tableaux, pointillés, couleurs, polices)
 * Gestion stricte du passage à la 2ème ligne pour le motif sans jamais déborder du cadre.
 * Valeurs par défaut : Date du jour actuel, Heure départ 08h00, Heure retour 16h30.
 */

const PDF = (() => {
  'use strict';

  let _currentMission = null;

  /* ---- Formatage dates et heures avec valeurs par défaut automatiques ---- */
  function _getTodayIso() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function _formatDate(dateStr) {
    const val = dateStr || _getTodayIso();
    const parts = String(val).split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return val;
  }

  function _formatTime(timeStr, defaultTime) {
    const val = timeStr || defaultTime;
    return String(val).replace(':', 'h');
  }

  function _esc(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* ---- Découpage automatique et intelligent du motif sur 2 lignes ---- */
  function _splitMotif(text, maxLine1 = 65, maxLine2 = 95) {
    if (!text) return { line1: '', line2: '' };
    const str = String(text).trim();

    // Si saut de ligne manuel tapé par l'utilisateur
    if (str.includes('\n')) {
      const parts = str.split('\n');
      return {
        line1: parts[0].slice(0, maxLine1).trim(),
        line2: parts.slice(1).join(' ').slice(0, maxLine2).trim()
      };
    }

    // Si tout tient sur la 1ère ligne
    if (str.length <= maxLine1) {
      return { line1: str, line2: '' };
    }

    // Coupure propre sur un espace pour ne pas couper un mot en deux
    let cut = str.lastIndexOf(' ', maxLine1);
    if (cut === -1 || cut < maxLine1 * 0.4) {
      cut = maxLine1;
    }

    const line1 = str.substring(0, cut).trim();
    const line2 = str.substring(cut).trim().slice(0, maxLine2);

    return { line1, line2 };
  }

  /* ---- Générateur du template HTML 100% conforme au document officiel ---- */
  function generateTemplate(missionData) {
    const m = missionData || {};
    const agent = m.agent || {};

    const todayIso = _getTodayIso();

    // Dates par défaut : date actuelle du jour
    const dateDepartVal = m.dateDepart || todayIso;
    const dateRetourVal = m.dateRetour || todayIso;
    const dateCreationVal = m.dateCreation || dateDepartVal || todayIso;

    const year = new Date(dateDepartVal).getFullYear() || new Date().getFullYear();

    const dateDepart = _formatDate(dateDepartVal);
    const dateRetour = _formatDate(dateRetourVal);
    const dateCreation = _formatDate(dateCreationVal);

    // Heures par défaut : 08h00 à 16h30
    const heureDepart = _formatTime(m.heureDepart, '08:00');
    const heureRetour = _formatTime(m.heureRetour, '16:30');

    const lieuCreation = _esc(m.lieuCreation || agent.province || 'OUEZZANE');

    // Découpage automatique du motif en 2 lignes sans déborder
    const motifParts = _splitMotif(m.motifDeplacement, 65, 95);

    // Ajustement dynamique de la hauteur des visas pour garantir STRICTEMENT 1 seule page A4
    const visaH1 = motifParts.line2 ? '33mm' : '37mm';
    const visaH2 = motifParts.line2 ? '36mm' : '41mm';

    // Cases à cocher carrées conformes à l'original (11x11px)
    const checkSvg = `<svg width="11" height="11" viewBox="0 0 12 12" style="vertical-align: middle; margin-right: 4px; display: inline-block;">
      <rect x="0.5" y="0.5" width="11" height="11" fill="#fff" stroke="#000" stroke-width="1.2"/>
      <path d="M2.5 6 L5 9 L9.5 2.5" fill="none" stroke="#000" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;

    const emptyBoxSvg = `<svg width="11" height="11" viewBox="0 0 12 12" style="vertical-align: middle; margin-right: 4px; display: inline-block;">
      <rect x="0.5" y="0.5" width="11" height="11" fill="#fff" stroke="#000" stroke-width="1.2"/>
    </svg>`;

    const isCov = Boolean(m.covoiturage);
    const isVehServ = Boolean(m.vehiculeService);
    const isTranspCom = Boolean(m.transportCommun);
    const isVehPerso = Boolean(m.vehiculePerso);

    const logoSrc = (typeof LOGO_BASE64 !== 'undefined' && LOGO_BASE64) ? LOGO_BASE64 : 'assets/logo.png';

    // Rendu du véhicule de service avec immatriculation et kilométrage
    let vehServiceVal = _esc(m.vehiculeServiceNum || '');
    if (isVehServ && m.kilometrage) {
      vehServiceVal += vehServiceVal ? ` (${_esc(m.kilometrage)} km)` : `${_esc(m.kilometrage)} km`;
    }

    // Formatage date création espacée (ex: 28 / 09 / 2026)
    const dateParts = dateCreation ? dateCreation.split('/') : ['', '', ''];
    const dateCreationFormatted = dateParts.length === 3 ? `${dateParts[0]} / ${dateParts[1]} / ${dateParts[2]}` : dateCreation;

    return `
    <div class="a4-document" id="om-page">
      <style>
        /* Règles strictes de confinement pour ne JAMAIS dépasser les bordures */
        .om-field {
          display: flex;
          align-items: baseline;
          width: 100%;
          font-size: 9pt;
          color: #000000;
          white-space: nowrap;
          overflow: hidden;
        }
        .om-dots {
          flex-grow: 1;
          border-bottom: 1.2px dotted #000000;
          display: inline-block;
          height: 1.1em;
          position: relative;
          min-width: 15px;
          overflow: hidden !important;
        }
        .om-value {
          position: absolute;
          bottom: 1px;
          left: 4px;
          right: 2px;
          font-weight: bold;
          color: #000000;
          white-space: nowrap;
          overflow: hidden !important;
          text-overflow: ellipsis;
          font-size: 9.5pt;
        }
        .om-td-motif-sub {
          height: 21pt !important;
          padding-top: 0 !important;
        }
      </style>

      <!-- EN-TETE / HEADER TABLE CONFORME 100% -->
      <table class="om-table om-table-header">
        <tr>
          <td class="om-td-logo">
            <img src="${logoSrc}" alt="Logo SRM TTA" class="om-logo-img">
          </td>
          <td class="om-td-title">
            <div class="om-hdr-subtitle">Formulaire Direction Provinciale</div>
            <div class="om-hdr-title">Ordre de mission</div>
          </td>
          <td class="om-td-meta">
            <div class="om-meta-row om-b-bottom">${year}</div>
            <div class="om-meta-row om-b-bottom">Version : 01</div>
            <div class="om-meta-row">Page 1 sur 1</div>
          </td>
        </tr>
      </table>

      <!-- CORPS PRINCIPAL: TABLE UNIQUE STRICTEMENT CONTINUE -->
      <table class="om-table om-table-body">
        <!-- SECTION DEMANDEUR -->
        <tr>
          <th colspan="2" class="om-th-section">Demandeur</th>
        </tr>
        <tr>
          <td colspan="2" class="om-td-row">
            <div class="om-field">
              <span class="om-label">Nom et pr&eacute;nom :</span>
              <span class="om-dots"><span class="om-value">${_esc(agent.nom || '')}</span></span>
            </div>
          </td>
        </tr>
        <tr>
          <td class="om-td-row om-col-half">
            <div class="om-field">
              <span class="om-label">Matricule :</span>
              <span class="om-dots"><span class="om-value">${_esc(agent.matricule || '')}</span></span>
            </div>
          </td>
          <td class="om-td-row om-col-half">
            <div class="om-field">
              <span class="om-label">Fonction :</span>
              <span class="om-dots"><span class="om-value">${_esc(agent.fonction || '')}</span></span>
            </div>
          </td>
        </tr>
        <tr>
          <td class="om-td-row om-col-half">
            <div class="om-field">
              <span class="om-label">Direction :</span>
              <span class="om-dots"><span class="om-value">${_esc(agent.direction || '')}</span></span>
            </div>
          </td>
          <td class="om-td-row om-col-half">
            <div class="om-field">
              <span class="om-label">D&eacute;partement :</span>
              <span class="om-dots"><span class="om-value">${_esc(agent.departement || '')}</span></span>
            </div>
          </td>
        </tr>
        <tr>
          <td class="om-td-row om-col-half">
            <div class="om-field">
              <span class="om-label">Division :</span>
              <span class="om-dots"><span class="om-value">${_esc(agent.division || '')}</span></span>
            </div>
          </td>
          <td class="om-td-row om-col-half">
            <div class="om-field">
              <span class="om-label">Service :</span>
              <span class="om-dots"><span class="om-value">${_esc(agent.service || '')}</span></span>
            </div>
          </td>
        </tr>
        <tr>
          <td colspan="2" class="om-td-row">
            <div class="om-field">
              <span class="om-label">Province / Pr&eacute;fecture :</span>
              <span class="om-dots"><span class="om-value">${_esc(agent.province || '')}</span></span>
            </div>
          </td>
        </tr>
        <tr class="om-row-spacer"><td colspan="2"></td></tr>

        <!-- SECTION OBJET DE LA MISSION -->
        <tr>
          <th colspan="2" class="om-th-section">Objet de la mission</th>
        </tr>
        <tr>
          <td colspan="2" class="om-td-row">
            <div class="om-field">
              <span class="om-label">Lieu de d&eacute;placement :</span>
              <span class="om-dots"><span class="om-value">${_esc(m.lieuDeplacement || '')}</span></span>
            </div>
          </td>
        </tr>
        <!-- LIGNE MOTIF 1 -->
        <tr>
          <td colspan="2" class="om-td-row">
            <div class="om-field">
              <span class="om-label">Motif du d&eacute;placement :</span>
              <span class="om-dots"><span class="om-value">${_esc(motifParts.line1)}</span></span>
            </div>
          </td>
        </tr>
        <!-- LIGNE MOTIF 2 (passage automatique à la 2ème ligne sans sortir du cadre) -->
        ${motifParts.line2 ? `
        <tr>
          <td colspan="2" class="om-td-row om-td-motif-sub">
            <div class="om-field">
              <span class="om-dots"><span class="om-value">${_esc(motifParts.line2)}</span></span>
            </div>
          </td>
        </tr>
        ` : ''}
        <tr>
          <td class="om-td-row om-col-half">
            <div class="om-field">
              <span class="om-label">Date de d&eacute;part :</span>
              <span class="om-dots"><span class="om-value">${dateDepart}</span></span>
            </div>
          </td>
          <td class="om-td-row om-col-half">
            <div class="om-field">
              <span class="om-label">Heure de d&eacute;part :</span>
              <span class="om-dots"><span class="om-value">${heureDepart}</span></span>
            </div>
          </td>
        </tr>
        <tr>
          <td class="om-td-row om-col-half">
            <div class="om-field">
              <span class="om-label">Date de retour :</span>
              <span class="om-dots"><span class="om-value">${dateRetour}</span></span>
            </div>
          </td>
          <td class="om-td-row om-col-half">
            <div class="om-field">
              <span class="om-label">Heure de retour :</span>
              <span class="om-dots"><span class="om-value">${heureRetour}</span></span>
            </div>
          </td>
        </tr>
        <tr class="om-row-spacer"><td colspan="2"></td></tr>

        <!-- SECTION MOYEN DE TRANSPORT -->
        <tr>
          <th colspan="2" class="om-th-section">Moyen de transport</th>
        </tr>
        <tr>
          <td colspan="2" class="om-td-row">
            <div class="om-field">
              <span class="om-checkbox">${isCov ? checkSvg : emptyBoxSvg}</span>
              <span class="om-label">Covoiturage :</span>
              <span class="om-dots"></span>
            </div>
          </td>
        </tr>
        <tr>
          <td colspan="2" class="om-td-row">
            <div class="om-field">
              <span class="om-checkbox">${isVehServ ? checkSvg : emptyBoxSvg}</span>
              <span class="om-label">V&eacute;hicule de service :</span>
              <span class="om-dots"><span class="om-value">${vehServiceVal}</span></span>
            </div>
          </td>
        </tr>
        <tr>
          <td colspan="2" class="om-td-row">
            <div class="om-field">
              <span class="om-checkbox">${isTranspCom ? checkSvg : emptyBoxSvg}</span>
              <span class="om-label">Transport commun :</span>
              <span class="om-dots"></span>
            </div>
          </td>
        </tr>
        <tr>
          <td colspan="2" class="om-td-row">
            <div class="om-field-split">
              <div class="om-field" style="flex: 1.1;">
                <span class="om-checkbox">${isVehPerso ? checkSvg : emptyBoxSvg}</span>
                <span class="om-label">V&eacute;hicule personnel : &nbsp; Marque :</span>
                <span class="om-dots"><span class="om-value">${_esc(m.vehiculePersoMarque || '')}</span></span>
              </div>
              <div class="om-field" style="flex: 0.9; margin-left: 12px;">
                <span class="om-label">Puissance Fiscale :</span>
                <span class="om-dots"><span class="om-value">${_esc(m.puissanceFiscale || '')}</span></span>
              </div>
            </div>
          </td>
        </tr>

        <!-- SIGNATURE & DATE -->
        <tr>
          <td colspan="2" class="om-td-signature">
            <div class="om-sig-container">
              <div class="om-sig-left">
                <div class="om-sig-line">
                  <span>Fait le :</span>
                  <span class="om-dots-fixed" style="width: 140px; text-align: center;">${dateCreationFormatted}</span>
                </div>
                <div class="om-sig-line" style="margin-top: 14px;">
                  <span>&agrave;</span>
                  <span class="om-dots-fixed" style="width: 180px;">${lieuCreation}</span>
                </div>
              </div>
              <div class="om-sig-right">
                <div class="om-sig-title">Signature de l'agent</div>
                <div class="om-sig-dots"></div>
              </div>
            </div>
          </td>
        </tr>

        <!-- VISAS (2x2) -->
        <tr>
          <th class="om-th-visa om-border-right">Visa Chef hi&eacute;rarchique</th>
          <th class="om-th-visa">Visa Chef de D&eacute;partement</th>
        </tr>
        <tr>
          <td class="om-td-visa om-border-right" style="height: ${visaH1};"></td>
          <td class="om-td-visa" style="height: ${visaH1};"></td>
        </tr>
        <tr>
          <th class="om-th-visa om-border-right">Visa Directeur Provincial/Pr&eacute;fectoral</th>
          <th class="om-th-visa">Visa Directeur Central Concern&eacute;</th>
        </tr>
        <tr>
          <td class="om-td-visa om-border-right" style="height: ${visaH2};"></td>
          <td class="om-td-visa om-td-visa-notice" style="height: ${visaH2};">
            <div class="om-visa-notice-text">
              Pri&egrave;re renseigner si le demandeur rel&egrave;ve d&rsquo;une fonction : Technique, support , client&egrave;le ; ou capital humain
            </div>
          </td>
        </tr>
      </table>

      <!-- NOTE BAS DE PAGE CONFORME A L'ORIGINAL -->
      <div class="om-page-note">
        NB/Le montant global des frais de d&eacute;placement doit figurer sur le formulaire de demande de remboursement des frais de d&eacute;placement.
      </div>
    </div>
    `;
  }

  /* ---- Prévisualisation dans la modale ---- */
  function showPreview(missionData) {
    _currentMission = missionData;
    const container = document.getElementById('preview-container');
    if (!container) return;

    container.innerHTML = generateTemplate(missionData);

    const printArea = document.getElementById('print-area');
    if (printArea) {
      printArea.innerHTML = generateTemplate(missionData);
    }

    if (typeof App !== 'undefined' && App.openModal) {
      App.openModal('preview-modal');
    }
  }

  function showPreviewById(id) {
    if (typeof Missions === 'undefined') return;
    const mission = Missions.getById(id);
    if (!mission) {
      if (typeof App !== 'undefined' && App.showToast) {
        App.showToast('Erreur', 'Ordre de mission introuvable.', 'error');
      }
      return;
    }
    showPreview(mission);
  }

  /* ---- Export PDF 100% A4 officiel sur 1 seule page ---- */
  function exportPDF() {
    if (!_currentMission) {
      if (typeof App !== 'undefined' && App.showToast) {
        App.showToast('Erreur', 'Aucun ordre de mission sélectionné pour l\'export.', 'error');
      }
      return;
    }
    _exportPDFFromMission(_currentMission);
  }

  function exportPDFById(id) {
    if (typeof Missions === 'undefined') return;
    const mission = Missions.getById(id);
    if (!mission) {
      if (typeof App !== 'undefined' && App.showToast) {
        App.showToast('Erreur', 'Ordre de mission introuvable.', 'error');
      }
      return;
    }
    showPreview(mission);
    setTimeout(() => exportPDF(), 300);
  }

  function _exportPDFFromMission(mission) {
    const el = document.getElementById('om-page');
    if (!el) {
      if (typeof App !== 'undefined' && App.showToast) {
        App.showToast('Erreur', 'Document A4 introuvable dans la page.', 'error');
      }
      return;
    }

    if (typeof html2pdf === 'undefined') {
      if (typeof App !== 'undefined' && App.showToast) {
        App.showToast('Erreur', 'La bibliothèque html2pdf n\'est pas disponible.', 'error');
      }
      return;
    }

    const agentName = (mission.agent && mission.agent.nom) ? mission.agent.nom.replace(/[^a-zA-Z0-9]/g, '_') : 'Agent';
    const dateStr = mission.dateDepart || _getTodayIso();
    const filename = `Ordre_de_Mission_${agentName}_${dateStr}.pdf`;

    if (typeof App !== 'undefined' && App.showToast) {
      App.showToast('Génération PDF', 'Création du document A4 officiel en cours...', 'info');
    }

    const origTransform = el.style.transform;
    const origMargin = el.style.margin;
    el.style.transform = 'none';
    el.style.margin = '0 auto';

    const opt = {
      margin: 0,
      filename: filename,
      image: { type: 'jpeg', quality: 1.0 },
      html2canvas: {
        scale: 2,
        useCORS: true,
        logging: false,
        scrollX: 0,
        scrollY: 0
      },
      jsPDF: {
        unit: 'mm',
        format: 'a4',
        orientation: 'portrait'
      }
    };

    html2pdf()
      .set(opt)
      .from(el)
      .toPdf()
      .get('pdf')
      .then((pdf) => {
        // Garantir STRICTEMENT 1 seule page
        const totalPages = pdf.internal.getNumberOfPages();
        for (let i = totalPages; i > 1; i--) {
          pdf.deletePage(i);
        }
      })
      .save()
      .then(() => {
        el.style.transform = origTransform;
        el.style.margin = origMargin;
        if (typeof App !== 'undefined' && App.showToast) {
          App.showToast('Succès', 'Ordre de mission téléchargé avec succès !', 'success');
        }
      })
      .catch((err) => {
        el.style.transform = origTransform;
        el.style.margin = origMargin;
        console.error(err);
        if (typeof App !== 'undefined' && App.showToast) {
          App.showToast('Erreur', 'Erreur lors de la génération du PDF.', 'error');
        }
      });
  }

  /* ---- Impression navigateur directe (Ctrl+P ou bouton Imprimer) ---- */
  function printPreview() {
    if (!_currentMission) return;
    const printArea = document.getElementById('print-area');
    if (!printArea) return;

    printArea.innerHTML = generateTemplate(_currentMission);
    printArea.style.display = 'block';

    window.print();

    setTimeout(() => {
      printArea.style.display = 'none';
    }, 1000);
  }

  /* ---- Initialisation des écouteurs ---- */
  function init() {
    const printBtn = document.getElementById('btn-print-preview');
    if (printBtn) {
      printBtn.addEventListener('click', printPreview);
    }

    const pdfBtn = document.getElementById('btn-export-pdf');
    if (pdfBtn) {
      pdfBtn.addEventListener('click', exportPDF);
    }
  }

  return {
    init,
    generateTemplate,
    showPreview,
    showPreviewById,
    exportPDF,
    exportPDFById,
    printPreview
  };
})();
