import { isEligible, legibleFontColor } from '../branding/theme.js';
import { PUB_SECTIONS } from './catalog.js';
import type { PubAuditPayload, PubConstat, PubLevel, PubVerdict } from './types.js';

/**
 * Render a pub audit payload into a self-contained editable HTML report
 * (format `brokercomply-pub/v1`) — same editing philosophy as the website audit:
 * contenteditable fields + verdict selects, a `<script id="__cfg">` rewritten by
 * the review route (save/submit URLs + initialEdits), and an embedded client
 * that collects structured edits keyed by constat id. Edits are re-injected
 * server-side (applyPubEdits) before the PDF workflow — the JSON payload stays
 * the single source of truth.
 */

const NIVEAU: Record<PubLevel, { label: string; color: string; bg: string }> = {
  rouge: { label: "Non conforme — ne pas diffuser", color: '#bb1626', bg: '#fde2e5' },
  orange: { label: 'Mentions à compléter', color: '#8a5300', bg: '#fdf1da' },
  jaune: { label: 'Sous réserve', color: '#4b5159', bg: '#eef0f2' },
  vert: { label: 'Aucun constat', color: '#1f7a44', bg: '#e7f4ec' },
};

const VERDICTS: Record<PubVerdict, { label: string; color: string; bg: string; icon: string }> = {
  non_conforme: { label: 'Non conforme', color: '#bb1626', bg: '#fde2e5', icon: '✗' },
  a_verifier: { label: 'À vérifier', color: '#8a5300', bg: '#fdf1da', icon: '?' },
  conforme: { label: 'Conforme', color: '#1f7a44', bg: '#e7f4ec', icon: '✓' },
  non_applicable: { label: 'Non applicable', color: '#8a9098', bg: '#f5f6f7', icon: '–' },
};

const PRODUIT_LABEL: Record<string, string> = {
  credit_conso: 'Crédit à la consommation',
  credit_hypothecaire: 'Crédit hypothécaire',
  assurance: 'Assurance',
  notoriete: 'Notoriété',
};

function esc(s: string | null | undefined): string {
  return (s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function verdictSelect(c: PubConstat): string {
  const options = (Object.keys(VERDICTS) as PubVerdict[])
    .map(
      (v) => `<option value="${v}"${v === c.verdict ? ' selected' : ''}>${VERDICTS[v].label}</option>`,
    )
    .join('');
  return `<select class="p-verdict p-verdict--${c.verdict}" data-cid="${esc(c.id)}">${options}</select>`;
}

function constatBlock(c: PubConstat, index: { section: number; item: number }): string {
  return `
  <article class="p-constat" data-cid="${esc(c.id)}">
    <header class="p-constat-head">
      <h3>${index.section}.${index.item} ${esc(c.intitule)} <span class="p-cid">${esc(c.id)}</span></h3>
      ${verdictSelect(c)}
    </header>
    ${c.base_legale ? `<div class="p-refs"><span class="p-ref">${esc(c.base_legale)}</span></div>` : ''}
    <div class="p-field">
      <label>Citation / constat</label>
      <div class="p-edit p-citation" contenteditable="true" data-ph="Citation ou constat d'absence…">${esc(c.citation ?? '')}</div>
    </div>
    <div class="p-field">
      <label>Explication</label>
      <div class="p-edit p-explication" contenteditable="true" data-ph="Explication…">${esc(c.explication ?? '')}</div>
    </div>
    <div class="p-field">
      <label>Reformulation proposée</label>
      <div class="p-edit p-reformulation" contenteditable="true" data-ph="Reformulation proposée…">${esc(c.reformulation ?? '')}</div>
    </div>
  </article>`;
}

export function renderPubHtml(payload: PubAuditPayload): string {
  const { support, constats, niveauGlobal, branding } = payload;
  const entite = support.entiteName ?? '';

  const brand =
    branding?.primaryColor && isEligible(branding.primaryColor)
      ? legibleFontColor(branding.primaryColor)
      : '#4653c8';
  const logoImg = branding?.logoUrl
    ? `<img class="p-logo" src="${esc(branding.logoUrl)}" alt="${esc(branding.firmName ?? entite)}">`
    : '';
  // The analysed creative, pinned in a left rail (sticky, vertically centred)
  // so it stays visible while the officer scrolls the constats. Falls back to a
  // single-column layout when there is no image.
  const hasAd = Boolean(support.image);
  const adRail = hasAd
    ? `<aside class="p-creative-rail"><figure class="p-creative"><img src="${esc(support.image)}" alt="${esc(support.fichier)}"><figcaption>Support analysé — ${esc(support.fichier)}</figcaption></figure></aside>`
    : '';

  // Group constats by section, in the canonical section order.
  const sections = PUB_SECTIONS.map((titre) => ({
    titre,
    constats: constats.filter((c) => c.section === titre),
  })).filter((s) => s.constats.length > 0);

  const sectionsHtml = sections
    .map(
      (sec, si) => `
    <section class="p-section">
      <h2>${si + 1}. ${esc(sec.titre)}</h2>
      ${sec.constats.map((c, ci) => constatBlock(c, { section: si + 1, item: ci + 1 })).join('')}
    </section>`,
    )
    .join('');

  const nv = NIVEAU[niveauGlobal.code];
  const produits = support.produits.map((p) => PRODUIT_LABEL[p] ?? p).join(', ');
  const d = niveauGlobal.decompte;

  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Audit de conformité publicitaire — ${esc(entite || support.fichier)}</title>
<style>
  :root{--ink:#1c2127;--muted:#6b7280;--line:#e3e6ea;--brand:${brand};--paper:#f7f8fa}
  *{box-sizing:border-box}
  body{margin:0;font:15px/1.6 -apple-system,'Segoe UI',Roboto,sans-serif;color:var(--ink);background:var(--paper)}
  .wrap{max-width:880px;margin:0 auto;padding:32px 24px 120px}
  /* Split layout: pinned ad on the left, scrolling report on the right. */
  .p-shell--split{display:grid;grid-template-columns:minmax(372px,480px) minmax(0,1fr);gap:28px;max-width:1440px;margin:0 auto;align-items:start}
  .p-shell--split .wrap{max-width:none;margin:0;padding-left:8px}
  .p-creative-rail{position:sticky;top:0;height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px 0 24px 24px}
  .p-creative-rail .p-creative{margin:0;max-height:100%;display:flex;flex-direction:column;align-items:center}
  .p-creative-rail .p-creative img{max-height:calc(100vh - 72px)}
  h1{font-size:26px;margin:0 0 4px}
  .p-logo{max-height:56px;max-width:220px;object-fit:contain;margin:0 0 12px;display:block}
  h2{font-size:19px;margin:36px 0 12px;padding-bottom:6px;border-bottom:2px solid var(--brand)}
  h3{font-size:15.5px;margin:0;flex:1}
  .p-sub{color:var(--muted);margin:0 0 20px}
  .p-meta{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:8px 24px;background:#fff;border:1px solid var(--line);border-radius:10px;padding:14px 18px;margin:18px 0;font-size:14px}
  .p-meta dt{color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:.04em}
  .p-meta dd{margin:0}
  .p-niveau{display:flex;align-items:center;gap:12px;border-radius:10px;padding:14px 18px;margin:18px 0;font-weight:700;font-size:16px;color:${esc(nv.color)};background:${esc(nv.bg)}}
  .p-creative{margin:18px 0;padding:0;text-align:center}
  .p-creative img{max-width:100%;max-height:420px;object-fit:contain;border:1px solid var(--line);border-radius:10px;background:#fff}
  .p-creative figcaption{margin-top:6px;font-size:12px;color:var(--muted)}
  .p-chips{display:flex;gap:10px;flex-wrap:wrap;margin:16px 0}
  .chip{border-radius:999px;padding:5px 14px;font-size:13px;font-weight:600;border:1px solid transparent}
  .p-constat{background:#fff;border:1px solid var(--line);border-radius:10px;padding:16px 18px;margin:12px 0}
  .p-constat-head{display:flex;align-items:center;gap:12px;margin-bottom:6px}
  .p-cid{color:var(--muted);font-size:12px;font-weight:400}
  .p-refs{margin:2px 0 8px}
  .p-ref{display:inline-block;background:var(--paper);border:1px solid var(--line);border-radius:6px;padding:1px 8px;font-size:12px;color:var(--muted)}
  .p-field{margin:10px 0}
  .p-field>label{display:block;font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:var(--muted);margin-bottom:3px}
  .p-edit{outline:1px dashed rgba(70,83,200,.35);outline-offset:3px;border-radius:6px;padding:2px 4px;min-height:1.4em;white-space:pre-wrap}
  .p-edit:hover{background:rgba(70,83,200,.05)}
  .p-edit:focus{background:rgba(70,83,200,.08);outline:2px solid var(--brand)}
  .p-edit:empty:before{content:attr(data-ph);color:var(--muted);font-style:italic}
  .p-citation{font-style:italic}
  .p-verdict{border:1px solid var(--line);border-radius:8px;padding:5px 8px;font-size:13px;font-weight:600;background:#fff}
  ${(Object.keys(VERDICTS) as PubVerdict[])
    .map((v) => `.p-verdict--${v}{color:${VERDICTS[v].color};background:${VERDICTS[v].bg}}`)
    .join('\n  ')}
  .p-bar{position:fixed;left:0;right:0;bottom:0;background:#fff;border-top:1px solid var(--line);padding:12px 24px;display:flex;gap:12px;align-items:center;box-shadow:0 -4px 16px rgba(0,0,0,.05)}
  .p-bar .p-status{flex:1;font-size:13.5px;color:var(--muted)}
  .p-status--ok{color:#1f7a44}.p-status--err{color:#bb1626}
  .p-btn{border:1px solid var(--line);background:#fff;border-radius:8px;padding:9px 18px;font-size:14px;font-weight:600;cursor:pointer}
  .p-btn--primary{background:var(--brand);border-color:var(--brand);color:#fff}
  .p-btn:disabled{opacity:.5;cursor:default}
  /* Narrow screens: drop the split, the ad becomes a static figure on top. */
  @media (max-width:900px){
    .p-shell--split{display:block;max-width:880px}
    .p-shell--split .wrap{padding-left:24px}
    .p-creative-rail{position:static;height:auto;padding:24px 24px 0;align-items:stretch}
    .p-creative-rail .p-creative img{max-height:452px}
  }
</style>
</head>
<body>
<div class="p-shell${hasAd ? ' p-shell--split' : ''}">
  ${adRail}
  <div class="wrap">
  ${logoImg}
  <h1>Audit de conformité publicitaire</h1>
  <p class="p-sub">${esc(entite || support.fichier)}</p>

  <div class="p-niveau" id="p-niveau" data-code="${esc(niveauGlobal.code)}">${esc(nv.label)} — <span class="p-niveau-txt">${esc(niveauGlobal.libelle)}</span></div>

  <dl class="p-meta">
    ${entite ? `<div><dt>Intermédiaire</dt><dd>${esc(entite)}</dd></div>` : ''}
    <div><dt>Support</dt><dd>${esc(support.fichier)}</dd></div>
    <div><dt>Format détecté</dt><dd>${esc(support.format)}</dd></div>
    <div><dt>Produit(s)</dt><dd>${esc(produits || '—')}</dd></div>
    <div><dt>Éléments fournis</dt><dd>${esc(support.elements_fournis.join(', '))}</dd></div>
    <div><dt>Date</dt><dd>${esc(payload.dateAnalyse)}</dd></div>
  </dl>

  <div class="p-chips">
    <span class="chip" style="color:#bb1626;background:#fde2e5">Non conformes : ${d.non_conforme}</span>
    <span class="chip" style="color:#8a5300;background:#fdf1da">À vérifier : ${d.a_verifier}</span>
    <span class="chip" style="color:#1f7a44;background:#e7f4ec">Conformes : ${d.conforme}</span>
    <span class="chip" style="color:#8a9098;background:#f5f6f7">N.A. : ${d.non_applicable}</span>
  </div>

  <div class="p-field">
    <label>Description du support</label>
    <div class="p-edit" id="h-description" contenteditable="true" data-ph="Description / transcription…">${esc(payload.description)}</div>
  </div>

  ${sectionsHtml}

  ${
    payload.note
      ? `<div class="p-field"><label>Note</label><div class="p-edit" id="h-note" contenteditable="true" data-ph="Note…">${esc(payload.note)}</div></div>`
      : `<div class="p-field" hidden><label>Note</label><div class="p-edit" id="h-note" contenteditable="true"></div></div>`
  }

  <div class="p-field">
    <label>Avertissement</label>
    <div class="p-edit" id="h-disclaimer" contenteditable="true" data-ph="Avertissement…">${esc(payload.disclaimer ?? '')}</div>
  </div>
  </div>
</div>

<div class="p-bar">
  <span class="p-status" id="p-status">Relisez et corrigez le rapport, puis générez le PDF.</span>
  <button type="button" class="p-btn" id="p-save">Enregistrer</button>
  <button type="button" class="p-btn p-btn--primary" id="p-submit">Générer le PDF</button>
</div>

<script type="application/json" id="__cfg">{"format":"brokercomply-pub/v1"}</script>
<script>(function pubClient() {
  var cfg = {};
  try { cfg = JSON.parse(document.getElementById('__cfg').textContent); } catch (e) {}
  var STORAGE_KEY = 'bcp_' + (cfg.token || 'draft');
  var dirty = false, sent = false, saveTimer = null;
  var txt = function (el) { return el ? (el.innerText || el.textContent || '').replace(/\\u00a0/g, ' ').trim() : ''; };

  function setStatus(msg, kind) {
    var s = document.getElementById('p-status');
    s.textContent = msg; s.className = 'p-status' + (kind ? ' p-status--' + kind : '');
  }

  function collectEdits() {
    var constats = {};
    document.querySelectorAll('.p-constat').forEach(function (art) {
      var cid = art.getAttribute('data-cid');
      if (!cid) return;
      var sel = art.querySelector('.p-verdict');
      constats[cid] = {
        verdict: sel ? sel.value : undefined,
        citation: txt(art.querySelector('.p-citation')),
        explication: txt(art.querySelector('.p-explication')),
        reformulation: txt(art.querySelector('.p-reformulation'))
      };
    });
    return {
      header: {
        description: txt(document.getElementById('h-description')),
        disclaimer: txt(document.getElementById('h-disclaimer')),
        note: txt(document.getElementById('h-note'))
      },
      constats: constats
    };
  }

  function applyEdits(ed) {
    if (!ed) return;
    if (ed.header) {
      if (ed.header.description !== undefined) document.getElementById('h-description').textContent = ed.header.description;
      if (ed.header.disclaimer !== undefined) document.getElementById('h-disclaimer').textContent = ed.header.disclaimer;
      if (ed.header.note !== undefined && document.getElementById('h-note')) document.getElementById('h-note').textContent = ed.header.note;
    }
    if (ed.constats) {
      Object.keys(ed.constats).forEach(function (cid) {
        var art = document.querySelector('.p-constat[data-cid="' + cid + '"]');
        if (!art) return;
        var e = ed.constats[cid];
        if (e.citation !== undefined) art.querySelector('.p-citation').textContent = e.citation;
        if (e.explication !== undefined) art.querySelector('.p-explication').textContent = e.explication;
        if (e.reformulation !== undefined) art.querySelector('.p-reformulation').textContent = e.reformulation;
        var sel = art.querySelector('.p-verdict');
        if (sel && e.verdict) { sel.value = e.verdict; restyleVerdict(sel); }
      });
    }
  }

  function restyleVerdict(sel) { sel.className = 'p-verdict p-verdict--' + sel.value; }

  function clearLocal() { try { localStorage.removeItem(STORAGE_KEY); } catch (e) {} }
  function saveLocal() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ at: Date.now(), edits: collectEdits() })); } catch (e) {}
  }
  function markDirty() {
    dirty = true;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(saveLocal, 800);
  }

  document.addEventListener('input', function (e) {
    if (e.target && (e.target.classList.contains('p-edit') || e.target.classList.contains('p-verdict'))) markDirty();
  });
  document.addEventListener('change', function (e) {
    if (e.target && e.target.classList.contains('p-verdict')) { restyleVerdict(e.target); markDirty(); }
  });

  document.getElementById('p-save').addEventListener('click', function () {
    var btn = this;
    if (!cfg.saveUrl) { setStatus('Aucune URL de sauvegarde configurée (mode hors-ligne).', 'err'); return; }
    btn.disabled = true; setStatus('Enregistrement…', '');
    fetch(cfg.saveUrl, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ edits: collectEdits() })
    }).then(function (res) { return res.json().catch(function () { return {}; }); })
      .then(function (data) {
        if (data && data.ok) { dirty = false; clearLocal(); setStatus('✅ Modifications enregistrées.', 'ok'); }
        else setStatus('⚠️ Échec de l\\u2019enregistrement.', 'err');
      })
      .catch(function () { setStatus('⚠️ Impossible de joindre le serveur.', 'err'); })
      .finally(function () { btn.disabled = false; });
  });

  document.getElementById('p-submit').addEventListener('click', function () {
    var btn = this;
    if (!cfg.submitUrl) { setStatus('Aucune URL de soumission configurée (mode hors-ligne).', 'err'); return; }
    btn.disabled = true; setStatus('Envoi en cours…', '');
    fetch(cfg.submitUrl, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ edits: collectEdits() })
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) { return { ok: res.ok, data: data }; });
    }).then(function (r) {
      if (r.ok && r.data && r.data.ok !== false) {
        sent = true; dirty = false; clearLocal();
        setStatus('✅ Génération du PDF lancée. Le document apparaîtra dans l\\u2019onglet Audit pub.', 'ok');
      } else {
        var errs = (r.data && r.data.errors) ? r.data.errors.join(' ') : 'Erreur lors de la génération.';
        setStatus('⚠️ ' + errs, 'err'); btn.disabled = false;
      }
    }).catch(function () {
      setStatus('⚠️ Impossible de joindre le serveur.', 'err'); btn.disabled = false;
    });
  });

  if (cfg.initialEdits) applyEdits(cfg.initialEdits);
  else {
    var raw = null;
    try { raw = localStorage.getItem(STORAGE_KEY); } catch (e) {}
    if (raw) {
      var saved; try { saved = JSON.parse(raw); } catch (e) {}
      if (saved && saved.edits && window.confirm('Un brouillon non enregistré a été retrouvé dans ce navigateur. Le restaurer ?')) {
        applyEdits(saved.edits);
        setStatus('Brouillon restauré. Pensez à Enregistrer.', 'ok');
      } else { clearLocal(); }
    }
  }

  window.addEventListener('beforeunload', function (e) {
    if (!dirty || sent) return;
    e.preventDefault(); e.returnValue = ''; return '';
  });
})();</script>
</body>
</html>`;
}
