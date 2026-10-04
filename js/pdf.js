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

  /* ---- Retour à la ligne automatique du motif, basé sur la LARGEUR RÉELLE du texte ----
   * Le texte est mesuré avec la même police que le PDF (canvas.measureText).
   * Chaque ligne est remplie jusqu'au bord du cadre, puis le texte passe à la ligne suivante
   * sans couper les mots. Maximum 3 lignes ; si le texte est encore trop long,
   * la taille de police est réduite progressivement pour que tout tienne dans le cadre.
   */
  const MM_TO_PX = 96 / 25.4;
  const PT_TO_PX = 96 / 72;
  const A4_FONT = "'Aptos Narrow', 'Calibri', 'Segoe UI', Arial, sans-serif";
  let _measureCtx = null;

  function _textWidth(text, sizePt, bold) {
    if (!_measureCtx) _measureCtx = document.createElement('canvas').getContext('2d');
    _measureCtx.font = `${bold ? 'bold ' : ''}${(sizePt * PT_TO_PX).toFixed(2)}px ${A4_FONT}`;
    return _measureCtx.measureText(text).width;
  }

  function _wrapWords(words, widths, sizePt, maxLines) {
    const lines = [];
    let current = '';
    let i = 0;
    while (i < words.length) {
      const lineIdx = lines.length;
      const maxW = widths[Math.min(lineIdx, widths.length - 1)];
      const word = words[i];
      const candidate = current ? current + ' ' + word : word;

      if (_textWidth(candidate, sizePt, true) <= maxW) {
        current = candidate;
        i++;
      } else if (!current) {
        // Mot plus long que la ligne entière : on le coupe caractère par caractère
        let part = '';
        for (const ch of word) {
          if (_textWidth(part + ch, sizePt, true) > maxW) break;
          part += ch;
        }
        part = part || word[0];
        lines.push(part);
        words[i] = word.slice(part.length);
        if (!words[i]) i++;
      } else {
        lines.push(current);
        current = '';
      }
      if (lines.length > maxLines) return null;
    }
    if (current) lines.push(current);
    return lines.length <= maxLines ? lines : null;
  }

  function _wrapMotif(text, maxLines = 3) {
    const str = String(text || '').replace(/\s*\n\s*/g, ' ').replace(/\s+/g, ' ').trim();
    if (!str) return { lines: [''], fontSize: 9.5 };

    // Largeur utile d'une ligne : A4 (210mm) - marges (2 x 8.3mm) - bordures - padding cellule (2 x 5pt)
    const rowWidthPx = (210 - 2 * 8.3 - 1) * MM_TO_PX - 2 * 5 * PT_TO_PX;
    const valueInsetPx = 4 + 2 + 6;          // left:4px + right:2px + marge de sécurité
    const labelPx = _textWidth('Motif du déplacement :', 9, false) + 4;
    const firstLineW = rowWidthPx - labelPx - valueInsetPx;
    const otherLineW = rowWidthPx - valueInsetPx;

    for (const size of [9.5, 9, 8.5, 8, 7.5, 7]) {
      const lines = _wrapWords(str.split(' '), [firstLineW, otherLineW], size, maxLines);
      if (lines) return { lines, fontSize: size };
    }
    // Dernier recours : police minimale, texte tronqué proprement à 3 lignes
    const fallback = [];
    const words = str.split(' ');
    let cur = '';
    for (const w of words) {
      const maxW = fallback.length === 0 ? firstLineW : otherLineW;
      const cand = cur ? cur + ' ' + w : w;
      if (_textWidth(cand, 7, true) <= maxW) { cur = cand; continue; }
      fallback.push(cur);
      cur = w;
      if (fallback.length === maxLines) break;
    }
    if (fallback.length < maxLines && cur) fallback.push(cur);
    return { lines: fallback.slice(0, maxLines), fontSize: 7 };
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

    // Retour à la ligne automatique du motif selon la largeur réelle du cadre
    const motif = _wrapMotif(m.motifDeplacement, 3);
    const motifExtra = motif.lines.length - 1;   // nombre de lignes supplémentaires (0 à 2)

    // Ajustement dynamique de la hauteur des visas pour garantir STRICTEMENT 1 seule page A4
    const visaH1 = ['37mm', '33mm', '29.5mm'][motifExtra];
    const visaH2 = ['41mm', '36mm', '32mm'][motifExtra];
    const motifStyle = motif.fontSize !== 9.5 ? ` style="font-size:${motif.fontSize}pt"` : '';
    const motifExtraRows = motif.lines.slice(1).map(line => `
        <tr>
          <td colspan="2" class="om-td-row om-td-motif-sub">
            <div class="om-field">
              <span class="om-dots"><span class="om-value"${motifStyle}>${_esc(line)}</span></span>
            </div>
          </td>
        </tr>`).join('');

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
              <span class="om-dots"><span class="om-value"${motifStyle}>${_esc(motif.lines[0])}</span></span>
            </div>
          </td>
        </tr>
        <!-- LIGNES MOTIF SUIVANTES (retour à la ligne automatique au bord du cadre) -->
        ${motifExtraRows}
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
