import type { AuditPayload, Finding, Level } from './types.js';

/**
 * Render an audit payload into a self-contained editable HTML report
 * (format `brokercomply-audit/v1`) — same editing philosophy as the
 * Fillout diagnostic review (`brokercomply-review/v1`): contenteditable
 * fields, a `<script id="__cfg">` rewritten by the review route (save/submit
 * URLs + initialEdits), an embedded client that collects structured edits.
 * Edits are keyed by finding id and re-injected into the payload server-side
 * (applyAuditEdits) before the PDF workflow is called — the JSON payload stays
 * the single source of truth.
 */

const LEVELS: Record<Level, { label: string; color: string; bg: string }> = {
  critique: { label: "Non-conformité critique", color: "#bb1626", bg: "#fde2e5" },
  amelioration: { label: "Amélioration recommandée", color: "#8a5300", bg: "#fdf1da" },
  conforme: { label: "Conforme", color: "#1f7a44", bg: "#e7f4ec" },
  a_verifier: { label: "À vérifier", color: "#4b5159", bg: "#eef0f2" },
  sans_objet: { label: "Sans objet", color: "#8a9098", bg: "#f5f6f7" },
};

const VERDICT_ICON: Record<string, string> = {
  conforme: "✓",
  non_conforme: "✗",
  a_verifier: "?",
  sans_objet: "–",
};

function esc(s: string | null | undefined): string {
  return (s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function levelSelect(finding: Finding): string {
  const options = (Object.keys(LEVELS) as Level[])
    .map(
      (lvl) =>
        `<option value="${lvl}"${lvl === finding.level ? " selected" : ""}>${LEVELS[lvl].label}</option>`,
    )
    .join("");
  return `<select class="a-level a-level--${finding.level}" data-pid="${esc(finding.id)}">${options}</select>`;
}

function checksDetail(finding: Finding): string {
  const checks = finding.checks ?? [];
  if (checks.length === 0) return "";
  const rows = checks
    .map(
      (c) => `
      <tr>
        <td class="chk-verdict chk-verdict--${esc(c.verdict)}">${VERDICT_ICON[c.verdict] ?? ""} ${esc(c.verdict)}</td>
        <td><strong>${esc(c.id)}</strong>${c.label ? ` — ${esc(c.label)}` : ""}
          ${c.evidence ? `<div class="chk-evidence">${esc(c.evidence)}</div>` : ""}
          ${c.source ? `<div class="chk-source">${esc(c.source)}</div>` : ""}
        </td>
        <td class="chk-article">${esc(c.article ?? "")}</td>
      </tr>`,
    )
    .join("");
  return `
    <details class="a-checks">
      <summary>Détail des vérifications (${checks.length})</summary>
      <table><tbody>${rows}</tbody></table>
    </details>`;
}

function findingBlock(finding: Finding, index: { section: number; item: number }): string {
  const legal = (finding.legalRefs ?? []).map((r) => `<span class="a-ref">${esc(r)}</span>`).join(" ");
  return `
  <article class="a-finding" data-pid="${esc(finding.id)}">
    <header class="a-finding-head">
      <h3>${index.section}.${index.item} ${esc(finding.title)} <span class="a-pid">${esc(finding.id)}</span></h3>
      ${levelSelect(finding)}
    </header>
    ${legal ? `<div class="a-refs">${legal}</div>` : ""}
    <div class="a-field">
      <label>Constat</label>
      <div class="a-edit a-constat" contenteditable="true" data-ph="Constat…">${esc(finding.constat)}</div>
    </div>
    <div class="a-field">
      <label>Recommandation</label>
      <div class="a-edit a-reco" contenteditable="true" data-ph="Recommandation…">${esc(finding.recommandation ?? "")}</div>
    </div>
    ${checksDetail(finding)}
  </article>`;
}

export function renderAuditHtml(payload: AuditPayload): string {
  const { audit, findings, summary } = payload;
  const pages = audit.pages ?? {};

  // Group findings by their section label, preserving payload order.
  const sections: Array<{ titre: string; findings: Finding[] }> = [];
  for (const f of findings) {
    const titre = f.section ?? "Autres points";
    const last = sections[sections.length - 1];
    if (last && last.titre === titre) last.findings.push(f);
    else sections.push({ titre, findings: [f] });
  }

  const sectionsHtml = sections
    .map(
      (sec, si) => `
    <section class="a-section">
      <h2>${si + 1}. ${esc(sec.titre)}</h2>
      ${sec.findings.map((f, fi) => findingBlock(f, { section: si + 1, item: fi + 1 })).join("")}
    </section>`,
    )
    .join("");

  const notAnalysed = (pages.notAnalysed ?? [])
    .map((p) => `<li>${esc(p.page)}${p.reason ? ` — <em>${esc(p.reason)}</em>` : ""}</li>`)
    .join("");
  const toVerify = (pages.toVerify ?? [])
    .map((t) => `<li>${esc(t.topic)}${t.reason ? ` — <em>${esc(t.reason)}</em>` : ""}</li>`)
    .join("");

  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Audit de conformité — ${esc(audit.entity.name)}</title>
<style>
  :root{--ink:#1c2127;--muted:#6b7280;--line:#e3e6ea;--brand:#4653c8;--paper:#f7f8fa}
  *{box-sizing:border-box}
  body{margin:0;font:15px/1.6 -apple-system,'Segoe UI',Roboto,sans-serif;color:var(--ink);background:var(--paper)}
  .wrap{max-width:880px;margin:0 auto;padding:32px 24px 120px}
  h1{font-size:26px;margin:0 0 4px}
  h2{font-size:19px;margin:36px 0 12px;padding-bottom:6px;border-bottom:2px solid var(--brand)}
  h3{font-size:15.5px;margin:0;flex:1}
  .a-sub{color:var(--muted);margin:0 0 20px}
  .a-meta{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:8px 24px;background:#fff;border:1px solid var(--line);border-radius:10px;padding:14px 18px;margin:18px 0;font-size:14px}
  .a-meta dt{color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:.04em}
  .a-meta dd{margin:0}
  .a-chips{display:flex;gap:10px;flex-wrap:wrap;margin:16px 0}
  .chip{border-radius:999px;padding:5px 14px;font-size:13px;font-weight:600;border:1px solid transparent}
  .a-pages{font-size:13px;color:var(--muted);background:#fff;border:1px solid var(--line);border-radius:10px;padding:12px 18px}
  .a-pages ul{margin:4px 0;padding-left:20px}
  .a-finding{background:#fff;border:1px solid var(--line);border-radius:10px;padding:16px 18px;margin:12px 0}
  .a-finding-head{display:flex;align-items:center;gap:12px;margin-bottom:6px}
  .a-pid{color:var(--muted);font-size:12px;font-weight:400}
  .a-refs{margin:2px 0 8px}
  .a-ref{display:inline-block;background:var(--paper);border:1px solid var(--line);border-radius:6px;padding:1px 8px;font-size:12px;color:var(--muted);margin-right:6px}
  .a-field{margin:10px 0}
  .a-field>label{display:block;font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:var(--muted);margin-bottom:3px}
  .a-edit{outline:1px dashed rgba(70,83,200,.35);outline-offset:3px;border-radius:6px;padding:2px 4px;min-height:1.4em;white-space:pre-wrap}
  .a-edit:hover{background:rgba(70,83,200,.05)}
  .a-edit:focus{background:rgba(70,83,200,.08);outline:2px solid var(--brand)}
  .a-edit:empty:before{content:attr(data-ph);color:var(--muted);font-style:italic}
  .a-level{border:1px solid var(--line);border-radius:8px;padding:5px 8px;font-size:13px;font-weight:600;background:#fff}
  ${(Object.keys(LEVELS) as Level[])
    .map((l) => `.a-level--${l}{color:${LEVELS[l].color};background:${LEVELS[l].bg}}`)
    .join("\n  ")}
  .a-checks{margin-top:10px;font-size:13.5px}
  .a-checks summary{cursor:pointer;color:var(--muted)}
  .a-checks table{width:100%;border-collapse:collapse;margin-top:8px}
  .a-checks td{border-top:1px solid var(--line);padding:7px 8px;vertical-align:top}
  .chk-verdict{white-space:nowrap;font-weight:600;width:110px}
  .chk-verdict--conforme{color:#1f7a44}.chk-verdict--non_conforme{color:#bb1626}
  .chk-verdict--a_verifier{color:#8a5300}.chk-verdict--sans_objet{color:#8a9098}
  .chk-evidence{color:var(--ink);font-style:italic;margin-top:2px}
  .chk-source{color:var(--muted);font-size:12px;word-break:break-all}
  .chk-article{color:var(--muted);font-size:12.5px;width:150px}
  .a-bar{position:fixed;left:0;right:0;bottom:0;background:#fff;border-top:1px solid var(--line);padding:12px 24px;display:flex;gap:12px;align-items:center;box-shadow:0 -4px 16px rgba(0,0,0,.05)}
  .a-bar .a-status{flex:1;font-size:13.5px;color:var(--muted)}
  .a-status--ok{color:#1f7a44}.a-status--err{color:#bb1626}
  .a-btn{border:1px solid var(--line);background:#fff;border-radius:8px;padding:9px 18px;font-size:14px;font-weight:600;cursor:pointer}
  .a-btn--primary{background:var(--brand);border-color:var(--brand);color:#fff}
  .a-btn:disabled{opacity:.5;cursor:default}
</style>
</head>
<body>
<div class="wrap">
  <h1>Audit de conformité du site web</h1>
  <p class="a-sub">${esc(audit.entity.name)} — <a href="${esc(audit.site.url)}" rel="noopener noreferrer">${esc(audit.site.url)}</a></p>

  <dl class="a-meta">
    <div><dt>Entité</dt><dd>${esc(audit.entity.name)}</dd></div>
    ${audit.entity.bce ? `<div><dt>BCE</dt><dd>${esc(audit.entity.bce)}</dd></div>` : ""}
    <div><dt>Statut FSMA</dt><dd class="a-edit" id="h-fsma" contenteditable="true" data-ph="Statut FSMA…">${esc(audit.entity.fsmaStatus ?? "à confirmer")}</dd></div>
    <div><dt>Date</dt><dd>${esc(audit.date)}</dd></div>
    ${audit.auditor ? `<div><dt>Auditeur</dt><dd>${esc(audit.auditor)}</dd></div>` : ""}
  </dl>

  <div class="a-chips">
    <span class="chip" style="color:#bb1626;background:#fde2e5">Critiques : ${summary?.critiques ?? 0}</span>
    <span class="chip" style="color:#8a5300;background:#fdf1da">Améliorations : ${summary?.ameliorations ?? 0}</span>
    <span class="chip" style="color:#1f7a44;background:#e7f4ec">Conformes : ${summary?.conformes ?? 0}</span>
    <span class="chip" style="color:#4b5159;background:#eef0f2">À vérifier : ${summary?.aVerifier ?? 0}</span>
  </div>

  <div class="a-field">
    <label>Périmètre</label>
    <div class="a-edit" id="h-scope" contenteditable="true" data-ph="Périmètre de l'audit…">${esc(audit.scope ?? "")}</div>
  </div>

  <div class="a-pages">
    <strong>Pages analysées (${(pages.analysed ?? []).length})</strong>
    <ul>${(pages.analysed ?? []).map((p) => `<li>${esc(p)}</li>`).join("")}</ul>
    ${notAnalysed ? `<strong>Pages non analysées</strong><ul>${notAnalysed}</ul>` : ""}
    ${toVerify ? `<strong>À vérifier manuellement</strong><ul>${toVerify}</ul>` : ""}
  </div>

  ${sectionsHtml}

  <div class="a-field">
    <label>Avertissement</label>
    <div class="a-edit" id="h-disclaimer" contenteditable="true" data-ph="Avertissement…">${esc(audit.disclaimer ?? "")}</div>
  </div>
</div>

<div class="a-bar">
  <span class="a-status" id="a-status">Relisez et corrigez le rapport, puis générez le PDF.</span>
  <button type="button" class="a-btn" id="a-save">Enregistrer</button>
  <button type="button" class="a-btn a-btn--primary" id="a-submit">Générer le PDF</button>
</div>

<script type="application/json" id="__cfg">{"format":"brokercomply-audit/v1"}</script>
<script>(function auditClient() {
  var cfg = {};
  try { cfg = JSON.parse(document.getElementById('__cfg').textContent); } catch (e) {}
  var STORAGE_KEY = 'bca_' + (cfg.token || 'draft');
  var dirty = false, sent = false, saveTimer = null;
  var txt = function (el) { return el ? (el.innerText || el.textContent || '').replace(/\\u00a0/g, ' ').trim() : ''; };

  function setStatus(msg, kind) {
    var s = document.getElementById('a-status');
    s.textContent = msg; s.className = 'a-status' + (kind ? ' a-status--' + kind : '');
  }

  function collectEdits() {
    var findings = {};
    document.querySelectorAll('.a-finding').forEach(function (art) {
      var pid = art.getAttribute('data-pid');
      if (!pid) return;
      var sel = art.querySelector('.a-level');
      findings[pid] = {
        constat: txt(art.querySelector('.a-constat')),
        recommandation: txt(art.querySelector('.a-reco')),
        level: sel ? sel.value : undefined
      };
    });
    return {
      header: {
        scope: txt(document.getElementById('h-scope')),
        disclaimer: txt(document.getElementById('h-disclaimer')),
        fsmaStatus: txt(document.getElementById('h-fsma'))
      },
      findings: findings
    };
  }

  function applyEdits(ed) {
    if (!ed) return;
    if (ed.header) {
      if (ed.header.scope !== undefined) document.getElementById('h-scope').textContent = ed.header.scope;
      if (ed.header.disclaimer !== undefined) document.getElementById('h-disclaimer').textContent = ed.header.disclaimer;
      if (ed.header.fsmaStatus !== undefined) document.getElementById('h-fsma').textContent = ed.header.fsmaStatus;
    }
    if (ed.findings) {
      Object.keys(ed.findings).forEach(function (pid) {
        var art = document.querySelector('.a-finding[data-pid="' + pid + '"]');
        if (!art) return;
        var e = ed.findings[pid];
        if (e.constat !== undefined) art.querySelector('.a-constat').textContent = e.constat;
        if (e.recommandation !== undefined) art.querySelector('.a-reco').textContent = e.recommandation;
        var sel = art.querySelector('.a-level');
        if (sel && e.level) { sel.value = e.level; restyleLevel(sel); }
      });
    }
  }

  function restyleLevel(sel) {
    sel.className = 'a-level a-level--' + sel.value;
  }

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
    if (e.target && (e.target.classList.contains('a-edit') || e.target.classList.contains('a-level'))) markDirty();
  });
  document.addEventListener('change', function (e) {
    if (e.target && e.target.classList.contains('a-level')) { restyleLevel(e.target); markDirty(); }
  });

  document.getElementById('a-save').addEventListener('click', function () {
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

  document.getElementById('a-submit').addEventListener('click', function () {
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
        setStatus('✅ Génération du PDF lancée. Le document apparaîtra dans l\\u2019onglet Audit site web.', 'ok');
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
