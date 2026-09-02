/* ===== Racha 2026 — app logic =====
   This whole file is treated as one block: it is embedded once as the
   live <script>, and copied verbatim (as LOGIC_SRC, a string) so that
   every republished version of the page can render and edit itself
   again with no server involved. Only SEED_STATE differs per publish. */

var STATE = null;
var ACTIVE_TAB = "linha";
var EDIT_MODE = false;
var DIRTY = false;
var READ_ONLY = false;
var ARTIFACT_NS = null;
var DOWNLOADS_NS = null;

var CODES = [
  { v: 3, key: "v", label: "V", name: "Vitória" },
  { v: 2, key: "e", label: "E", name: "Empate" },
  { v: 1, key: "d", label: "D", name: "Derrota" },
  { v: 0, key: "a", label: "A", name: "Assistiu" },
  { v: -1, key: "f", label: "F", name: "Falta" }
];
var CODE_CYCLE = [null, 3, 2, 1, 0, -1];

function codeInfo(val) {
  if (val === null || val === undefined) return null;
  for (var i = 0; i < CODES.length; i++) if (CODES[i].v === val) return CODES[i];
  return null;
}

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
}

function slugify(name) {
  return String(name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function avatarColor(name) {
  var palette = ["#2E7A43", "#B9872B", "#6E5D45", "#3E6E8E", "#7A4F9E", "#B0763F", "#4A7C59", "#8E5A3C"];
  var h = 0;
  for (var i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return palette[h % palette.length];
}

function initials(name) {
  var parts = String(name).trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function isFinalWeek(w) {
  return w.status !== "pending";
}

function isPendingWeek(w) {
  return w.status === "pending";
}

function finalWeeksOf(cat) {
  return cat.weeks.filter(isFinalWeek);
}

function pendingWeeksOf(cat) {
  return cat.weeks.filter(isPendingWeek);
}

function teamOf(week, playerId) {
  if (!week.teams) return null;
  if (week.teams.a && week.teams.a.indexOf(playerId) !== -1) return "a";
  if (week.teams.b && week.teams.b.indexOf(playerId) !== -1) return "b";
  return null;
}

function missingFromTeams(cat, week) {
  return cat.players.filter(function (p) { return !teamOf(week, p.id); });
}

/* ---------- name matching for pasted team lists ---------- */

function normalizeName(s) {
  return String(s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/* Confidence tiers: 100/90 = same name (safe to auto-link), 70/60 = only a
   partial/nickname-ish resemblance — never auto-linked, only offered as a
   "vincular?" suggestion the admin must accept on purpose. Two different
   people can share a nickname fragment (JE = Jeferson the goalkeeper is not
   JEH the line player), so anything below 90 stays opt-in. */
var MATCH_AUTOLINK_THRESHOLD = 90;

function guessMatch(cat, raw) {
  var norm = normalizeName(raw);
  if (!norm) return null;
  var normNoSpace = norm.replace(/ /g, "");
  var best = null;
  var bestScore = 0;
  cat.players.forEach(function (p) {
    var pn = normalizeName(p.name);
    var pnNoSpace = pn.replace(/ /g, "");
    var score = 0;
    if (pn === norm) score = 100;
    else if (pnNoSpace === normNoSpace) score = 90;
    else if (pn.indexOf(norm) !== -1 || norm.indexOf(pn) !== -1) score = 70;
    else {
      var pTokens = pn.split(" ");
      var nTokens = norm.split(" ");
      if (pTokens[0] === nTokens[0]) score = 60;
    }
    if (score > bestScore) { bestScore = score; best = p; }
  });
  return best ? { id: best.id, name: best.name, score: bestScore } : null;
}

/* Splits a pasted "Time A  x  Time B" list into row pairs. Each line may
   start with a jersey number or a ball marker before " - Nome". */
function parseTeamsPaste(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map(function (line) { return line.trim(); })
    .filter(function (line) { return line.length > 0; })
    .map(function (line) {
      var parts = line.split(/\s+x\s+|\s*×\s*/i);
      if (parts.length < 2) parts = line.split(/\s{2,}/);
      var left = parts[0] || "";
      var right = parts.slice(1).join(" ") || "";
      return { aRaw: stripLineupPrefix(left), bRaw: stripLineupPrefix(right) };
    })
    .filter(function (row) { return row.aRaw || row.bRaw; });
}

function stripLineupPrefix(s) {
  return String(s || "")
    .trim()
    .replace(/^[⚽⚔️]*\s*\d*\s*-\s*/u, "")
    .replace(/^\d+\s*-\s*/, "")
    .trim();
}

/* ---------- stats ---------- */

function computeStats(cat) {
  var weeks = finalWeeksOf(cat);
  var totalWeeks = weeks.length;
  return cat.players.map(function (p) {
    var v = 0, e = 0, d = 0, a = 0, f = 0, pts = 0;
    weeks.forEach(function (w) {
      var val = p.weeks[w.id];
      if (val === undefined || val === null) return;
      pts += val;
      if (val === 3) v++;
      else if (val === 2) e++;
      else if (val === 1) d++;
      else if (val === 0) a++;
      else if (val === -1) f++;
    });
    var presence = v + e + d;
    var pctPresence = totalWeeks ? presence / totalWeeks : 0;
    return { player: p, pts: pts, v: v, e: e, d: d, a: a, f: f, presence: presence, pctPresence: pctPresence };
  }).sort(function (a, b) {
    if (b.pts !== a.pts) return b.pts - a.pts;
    if (b.v !== a.v) return b.v - a.v;
    return b.pctPresence - a.pctPresence;
  });
}

/* ---------- rendering ---------- */

function currentCategory() {
  return STATE.data[ACTIVE_TAB];
}

function renderAll() {
  renderHeaderMeta();
  renderReadonlyBanner();
  renderTabs();
  renderToolbar();
  renderEditStrip();
  renderPendingRounds(currentCategory());
  var rows = computeStats(currentCategory());
  renderPodium(rows);
  renderTable(currentCategory(), rows);
  renderLegend();
}

function renderHeaderMeta() {
  var chip = document.getElementById("updated-chip");
  if (!chip) return;
  chip.textContent = STATE.updatedAt ? "Atualizado em " + STATE.updatedAt : "Sem atualizações ainda";
}

function renderReadonlyBanner() {
  var slot = document.getElementById("readonly-banner-slot");
  if (!slot) return;
  if (READ_ONLY) {
    slot.innerHTML =
      '<div class="readonly-banner">Somente leitura — quem administra o Racha edita a tabela; você acompanha a classificação em tempo real por aqui.</div>';
  } else {
    slot.innerHTML = "";
  }
}

function renderTabs() {
  var el = document.getElementById("tabbar");
  if (!el) return;
  var order = ["linha", "goleiros"];
  el.innerHTML = order
    .filter(function (k) { return STATE.data[k]; })
    .map(function (key) {
      var cat = STATE.data[key];
      var active = key === ACTIVE_TAB ? " active" : "";
      return (
        '<button type="button" class="tab-btn' +
        active +
        '" data-tab="' +
        key +
        '" role="tab" aria-selected="' +
        (key === ACTIVE_TAB) +
        '">' +
        esc(cat.label) +
        "</button>"
      );
    })
    .join("");
  Array.prototype.forEach.call(el.querySelectorAll(".tab-btn"), function (btn) {
    btn.addEventListener("click", function () {
      ACTIVE_TAB = btn.getAttribute("data-tab");
      renderAll();
    });
  });
}

function renderToolbar() {
  var left = document.getElementById("toolbar-left");
  var right = document.getElementById("toolbar-right");
  if (!left || !right) return;
  var cat = currentCategory();
  var finalCount = finalWeeksOf(cat).length;
  var pendingCount = pendingWeeksOf(cat).length;
  left.textContent =
    cat.players.length + " atletas · " + finalCount + " rodada" + (finalCount === 1 ? "" : "s") + " registrada" + (finalCount === 1 ? "" : "s") +
    (pendingCount ? " · " + pendingCount + " aguardando resultado" : "");

  var downloadBtns = DOWNLOADS_NS
    ? '<button type="button" class="btn btn-sm btn-ghost" id="btn-export-csv">Exportar CSV</button>' +
      '<button type="button" class="btn btn-sm btn-ghost" id="btn-backup-json">Backup</button>'
    : "";

  if (READ_ONLY) {
    right.innerHTML = downloadBtns;
    bind("btn-export-csv", "click", exportCsv);
    bind("btn-backup-json", "click", exportJsonBackup);
    return;
  }

  if (!EDIT_MODE) {
    right.innerHTML =
      downloadBtns +
      '<button type="button" class="btn" id="btn-enter-edit">' + pencilSvg() + " Editar</button>";
    var b = document.getElementById("btn-enter-edit");
    if (b) b.addEventListener("click", function () { EDIT_MODE = true; renderAll(); });
  } else {
    right.innerHTML = downloadBtns;
  }
  bind("btn-export-csv", "click", exportCsv);
  bind("btn-backup-json", "click", exportJsonBackup);
}

/* CSV export of the currently visible category's standings table
   (one row per athlete, one column per registered round + totals). */
function exportCsv() {
  var cat = currentCategory();
  var weeks = finalWeeksOf(cat);
  var rows = computeStats(cat);
  var header = ["Atleta"].concat(weeks.map(function (w) { return w.label; })).concat(["Pts", "V", "E", "D", "F", "Presença %"]);
  function csvCell(v) {
    var s = String(v == null ? "" : v);
    if (/[",\n;]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
    return s;
  }
  var lines = [header.map(csvCell).join(";")];
  rows.forEach(function (r) {
    var cells = [r.player.name];
    weeks.forEach(function (w) {
      var v = r.player.weeks[w.id];
      var info = codeInfo(v);
      cells.push(info ? info.label : "");
    });
    cells.push(r.pts, r.v, r.e, r.d, r.f, Math.round(r.pctPresence * 100));
    lines.push(cells.map(csvCell).join(";"));
  });
  var csv = "﻿" + lines.join("\r\n");
  if (!DOWNLOADS_NS) return;
  var fname = slugify(cat.label) + "-" + todayLabel().replace(/\//g, "-") + ".csv";
  DOWNLOADS_NS.save({ filename: fname, data: csv }).then(
    function () { showToast("CSV exportado."); },
    function (err) { showToast(downloadErrorMessage(err)); }
  );
}

/* Full JSON backup of the whole app state (both categories), so the
   admin can keep a copy outside the artifact or restore from it later. */
function exportJsonBackup() {
  if (!DOWNLOADS_NS) return;
  var json = JSON.stringify(STATE, null, 2);
  var fname = "racha-2026-backup-" + todayLabel().replace(/\//g, "-") + ".json";
  DOWNLOADS_NS.save({ filename: fname, data: json }).then(
    function () { showToast("Backup salvo."); },
    function (err) { showToast(downloadErrorMessage(err)); }
  );
}

function downloadErrorMessage(err) {
  var code = err && err.code;
  if (code === "declined") return "Download cancelado.";
  if (code === "rate_limited") return "Muitos downloads seguidos, espera um pouco e tenta de novo.";
  if (code === "too_large") return "Arquivo grande demais pra exportar.";
  if (code === "unavailable" || code === "extension_not_enabled" || code === "rejected_extension") return "Não consegui exportar esse arquivo agora.";
  return "Não consegui exportar o arquivo.";
}

function renderEditStrip() {
  var slot = document.getElementById("edit-strip-slot");
  if (!slot) return;
  if (!EDIT_MODE || READ_ONLY) { slot.innerHTML = ""; return; }
  slot.innerHTML =
    '<div class="edit-strip">' +
    '<div class="edit-strip-left"><span class="dot"></span>Modo edição — clique numa rodada para mudar o resultado' +
    (DIRTY ? ' <strong>&middot; alterações não salvas</strong>' : "") +
    "</div>" +
    '<div class="edit-strip-right">' +
    '<button type="button" class="btn btn-sm" id="btn-add-player">+ Atleta</button>' +
    '<button type="button" class="btn btn-sm" id="btn-add-week">+ Rodada</button>' +
    '<button type="button" class="btn btn-sm btn-ghost" id="btn-cancel-edit">Cancelar</button>' +
    '<button type="button" class="btn btn-sm btn-accent" id="btn-save-edit">Salvar</button>' +
    "</div></div>";

  bind("btn-add-player", "click", openAddPlayerModal);
  bind("btn-add-week", "click", openNewRoundModal);
  bind("btn-cancel-edit", "click", cancelEdit);
  bind("btn-save-edit", "click", saveEdit);
}

function bind(id, evt, fn) {
  var el = document.getElementById(id);
  if (el) el.addEventListener(evt, fn);
}

function pencilSvg() {
  return '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>';
}

function chartSvg() {
  return '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M18.7 8 12 14.7 9 11.7 5.3 15.4"/></svg>';
}

/* ---------- player evolution / streak stats ---------- */

/* Cumulative-points series across a player's final (played) weeks, in
   chronological order, for the line chart. */
function playerSeries(cat, player) {
  var weeks = finalWeeksOf(cat);
  var running = 0;
  return weeks
    .filter(function (w) { return player.weeks[w.id] !== undefined && player.weeks[w.id] !== null; })
    .map(function (w) {
      running += player.weeks[w.id];
      return { week: w, val: player.weeks[w.id], cum: running };
    });
}

/* Current streak: consecutive most-recent played weeks that share the
   same outcome (V/E/D/A/F) as the very last one played. best: longest
   historical run of victories (V=3). form5: points earned over the
   last 5 played weeks, as a % of the max possible (3 per week). */
function playerStreaks(cat, player) {
  var weeks = finalWeeksOf(cat);
  var played = weeks
    .filter(function (w) { return player.weeks[w.id] !== undefined && player.weeks[w.id] !== null; })
    .map(function (w) { return player.weeks[w.id]; });

  var current = 0;
  if (played.length) {
    var last = played[played.length - 1];
    for (var i = played.length - 1; i >= 0 && played[i] === last; i--) current++;
  }

  var best = 0, run = 0;
  played.forEach(function (v) {
    if (v === 3) { run++; best = Math.max(best, run); } else { run = 0; }
  });

  var last5 = played.slice(-5);
  var form5 = last5.length ? Math.round((last5.reduce(function (a, b) { return a + b; }, 0) / (last5.length * 3)) * 100) : null;

  return {
    currentStreak: current,
    currentCode: played.length ? codeInfo(played[played.length - 1]) : null,
    bestWinStreak: best,
    form5: form5,
    form5Count: last5.length
  };
}

/* Inline SVG line chart (no library) of cumulative points over time. */
function sparklineSvg(series) {
  if (series.length < 2) {
    return '<p class="team-builder-hint">Ainda não tem rodadas suficientes pra mostrar o gráfico.</p>';
  }
  var w = 520, h = 160, pad = 28;
  var vals = series.map(function (s) { return s.cum; });
  var min = Math.min.apply(null, vals.concat([0]));
  var max = Math.max.apply(null, vals.concat([0]));
  if (max === min) { max += 1; min -= 1; }
  var stepX = (w - pad * 2) / (series.length - 1);
  function x(i) { return pad + i * stepX; }
  function y(v) { return h - pad - ((v - min) / (max - min)) * (h - pad * 2); }
  var points = series.map(function (s, i) { return x(i) + "," + y(s.cum); }).join(" ");
  var zeroY = y(0);
  var dots = series
    .map(function (s, i) {
      return '<circle cx="' + x(i) + '" cy="' + y(s.cum) + '" r="3.5" fill="var(--accent)"><title>' + esc(s.week.label) + ": " + s.cum + " pts</title></circle>";
    })
    .join("");
  return (
    '<svg class="evolution-chart" viewBox="0 0 ' + w + " " + h + '" preserveAspectRatio="none" role="img" aria-label="Evolução de pontos">' +
    '<line x1="' + pad + '" y1="' + zeroY + '" x2="' + (w - pad) + '" y2="' + zeroY + '" stroke="var(--border)" stroke-dasharray="4 4"/>' +
    '<polyline points="' + points + '" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>' +
    dots +
    "</svg>"
  );
}

function openPlayerDetailModal(cat, playerId) {
  var player = cat.players.filter(function (p) { return p.id === playerId; })[0];
  if (!player) return;
  var series = playerSeries(cat, player);
  var s = playerStreaks(cat, player);
  var STREAK_WORDS = {
    v: ["vitória", "vitórias", "seguida", "seguidas"],
    e: ["empate", "empates", "seguido", "seguidos"],
    d: ["derrota", "derrotas", "seguida", "seguidas"],
    a: ["jogo assistido", "jogos assistidos", "seguido", "seguidos"],
    f: ["falta", "faltas", "seguida", "seguidas"]
  };
  var streakTxt = "sem rodadas ainda";
  if (s.currentStreak && s.currentCode) {
    var words = STREAK_WORDS[s.currentCode.key];
    var plural = s.currentStreak > 1;
    streakTxt = s.currentStreak + " " + words[plural ? 1 : 0] + " " + words[plural ? 3 : 2];
  }
  var body =
    sparklineSvg(series) +
    '<div class="detail-stats-grid">' +
    '<div class="detail-stat"><span class="detail-stat-label">Sequência atual</span><span class="detail-stat-value">' + esc(streakTxt) + "</span></div>" +
    '<div class="detail-stat"><span class="detail-stat-label">Melhor sequência de vitórias</span><span class="detail-stat-value">' + s.bestWinStreak + "</span></div>" +
    '<div class="detail-stat"><span class="detail-stat-label">Aproveitamento (últimas ' + s.form5Count + ')</span><span class="detail-stat-value">' + (s.form5 === null ? "—" : s.form5 + "%") + "</span></div>" +
    "</div>";
  showModal(player.name, body, function () {}, "Fechar");
  var cancelBtn = document.getElementById("modal-cancel");
  if (cancelBtn) cancelBtn.style.display = "none";
}

function rankColor(i) {
  if (i === 0) return "var(--gold)";
  if (i === 1) return "var(--silver)";
  if (i === 2) return "var(--bronze)";
  return null;
}

function renderPodium(rows) {
  var el = document.getElementById("podium");
  if (!el) return;
  var top = rows.slice(0, 3);
  if (!top.length) { el.innerHTML = ""; return; }
  el.innerHTML = top
    .map(function (r, i) {
      return (
        '<div class="podium-card" style="--rank-color:' +
        rankColor(i) +
        '">' +
        '<div class="podium-rank" style="background:' +
        rankColor(i) +
        '">' +
        (i + 1) +
        "º</div>" +
        '<div class="podium-name">' +
        esc(r.player.name) +
        "</div>" +
        '<div class="podium-pts">' +
        r.pts +
        '<span>pts</span></div>' +
        '<div class="podium-record mono">' +
        r.v +
        "V " +
        r.e +
        "E " +
        r.d +
        "D " +
        (r.f ? r.f + "F " : "") +
        Math.round(r.pctPresence * 100) +
        "% presença</div>" +
        "</div>"
      );
    })
    .join("");
}

function renderTable(cat, rows) {
  var thead = document.getElementById("thead-row");
  var tbody = document.getElementById("tbody");
  if (!thead || !tbody) return;

  var weeks = finalWeeksOf(cat);
  var weekHeads = weeks
    .map(function (w) {
      var removeBtn =
        EDIT_MODE && !READ_ONLY
          ? '<button type="button" class="week-remove" data-remove-week="' + w.id + '" title="Remover rodada">×</button>'
          : "";
      return (
        '<th class="week-head" scope="col"><div class="week-head-inner"><span class="week-date">' +
        esc(w.label) +
        "</span>" +
        (w.result ? '<span class="week-score">' + esc(w.result) + "</span>" : "") +
        removeBtn +
        "</div></th>"
      );
    })
    .join("");

  thead.innerHTML =
    '<th class="col-pos" scope="col">#</th>' +
    '<th class="col-athlete" scope="col">Atleta</th>' +
    '<th scope="col">Pts</th>' +
    '<th scope="col">V</th><th scope="col">E</th><th scope="col">D</th><th scope="col">F</th>' +
    '<th scope="col">Presença</th>' +
    weekHeads;

  if (!rows.length) {
    tbody.innerHTML =
      '<tr><td colspan="99" class="empty-note">Nenhum atleta nesta categoria ainda.</td></tr>';
  } else {
    tbody.innerHTML = rows
      .map(function (r, idx) {
        var weekCells = weeks
          .map(function (w) {
            return renderChipCell(cat, r.player, w);
          })
          .join("");
        var ptsClass = r.pts > 0 ? "pos" : r.pts < 0 ? "neg" : "";
        return (
          '<tr data-player="' +
          r.player.id +
          '">' +
          '<td class="col-pos">' +
          (idx + 1) +
          "</td>" +
          '<td class="col-athlete"><div class="athlete-cell"><span class="avatar" style="background:' +
          avatarColor(r.player.name) +
          '">' +
          esc(initials(r.player.name)) +
          "</span><span class=\"athlete-name\">" +
          esc(r.player.name) +
          "</span>" +
          '<button type="button" class="athlete-detail-btn" data-detail-player="' +
          r.player.id +
          '" title="Ver evolução" style="margin-left:auto;">' +
          chartSvg() +
          "</button>" +
          (EDIT_MODE && !READ_ONLY
            ? '<button type="button" class="athlete-rename-btn" data-rename-player="' +
              r.player.id +
              '" title="Renomear atleta" style="margin-left:auto;">' +
              pencilSvg() +
              "</button>" +
              '<button type="button" class="btn-ghost btn-sm btn-danger" data-remove-player="' +
              r.player.id +
              '" title="Remover atleta" style="border:none;background:none;">×</button>'
            : "") +
          "</div></td>" +
          '<td class="col-pts ' +
          ptsClass +
          '">' +
          r.pts +
          "</td>" +
          '<td class="stat-v">' +
          r.v +
          "</td><td class=\"stat-e\">" +
          r.e +
          "</td><td class=\"stat-d\">" +
          r.d +
          "</td><td class=\"stat-f\">" +
          r.f +
          "</td>" +
          '<td><div class="presence-cell"><div class="presence-track"><div class="presence-fill" style="width:' +
          Math.round(r.pctPresence * 100) +
          '%"></div></div><span class="presence-pct">' +
          Math.round(r.pctPresence * 100) +
          "%</span></div></td>" +
          weekCells +
          "</tr>"
        );
      })
      .join("");
  }

  Array.prototype.forEach.call(tbody.querySelectorAll("[data-detail-player]"), function (btn) {
    btn.addEventListener("click", function () {
      openPlayerDetailModal(cat, btn.getAttribute("data-detail-player"));
    });
  });

  if (EDIT_MODE && !READ_ONLY) {
    Array.prototype.forEach.call(tbody.querySelectorAll(".chip-editable"), function (chip) {
      chip.addEventListener("click", onChipClick);
    });
    Array.prototype.forEach.call(tbody.querySelectorAll("[data-remove-player]"), function (btn) {
      btn.addEventListener("click", function () {
        removePlayer(btn.getAttribute("data-remove-player"));
      });
    });
    Array.prototype.forEach.call(tbody.querySelectorAll("[data-rename-player]"), function (btn) {
      btn.addEventListener("click", function () {
        openRenamePlayerModal(btn.getAttribute("data-rename-player"));
      });
    });
    Array.prototype.forEach.call(thead.querySelectorAll("[data-remove-week]"), function (btn) {
      btn.addEventListener("click", function () {
        removeWeek(btn.getAttribute("data-remove-week"));
      });
    });
  }
}

function renderChipCell(cat, player, week) {
  var val = player.weeks[week.id];
  var info = codeInfo(val);
  var cls = info ? "chip chip-" + info.key : "chip chip-blank";
  var label = info ? info.label : "–";
  var editable = EDIT_MODE && !READ_ONLY;
  return (
    '<td><span class="' +
    cls +
    (editable ? " chip-editable" : "") +
    '"' +
    (editable ? ' data-chip-player="' + player.id + '" data-chip-week="' + week.id + '" title="Clique para mudar"' : "") +
    ">" +
    label +
    "</span></td>"
  );
}

function onChipClick(e) {
  var el = e.currentTarget;
  var playerId = el.getAttribute("data-chip-player");
  var weekId = el.getAttribute("data-chip-week");
  var cat = currentCategory();
  var player = cat.players.filter(function (p) { return p.id === playerId; })[0];
  if (!player) return;
  var current = player.weeks[weekId];
  current = current === undefined ? null : current;
  var idx = CODE_CYCLE.indexOf(current);
  var next = CODE_CYCLE[(idx + 1 + CODE_CYCLE.length) % CODE_CYCLE.length];
  if (next === null) delete player.weeks[weekId];
  else player.weeks[weekId] = next;
  DIRTY = true;
  renderAll();
}

function renderLegend() {
  var el = document.getElementById("legend");
  if (!el) return;
  el.innerHTML = CODES.map(function (c) {
    return (
      '<div class="legend-item"><span class="chip chip-' +
      c.key +
      '">' +
      c.label +
      "</span>" +
      esc(c.name) +
      " (" +
      (c.v > 0 ? "+" : "") +
      c.v +
      " pt" +
      (Math.abs(c.v) === 1 ? "" : "s") +
      ")</div>"
    );
  }).join("");
}

/* ---------- edit actions ---------- */

var SNAPSHOT_BEFORE_EDIT = null;

function cancelEdit() {
  if (SNAPSHOT_BEFORE_EDIT) STATE = JSON.parse(SNAPSHOT_BEFORE_EDIT);
  EDIT_MODE = false;
  DIRTY = false;
  SNAPSHOT_BEFORE_EDIT = null;
  renderAll();
}

function removePlayer(playerId) {
  var cat = currentCategory();
  var player = cat.players.filter(function (p) { return p.id === playerId; })[0];
  if (!player) return;
  showConfirm(
    "Remover atleta",
    'Remover "' + player.name + '" apaga o histórico de pontos dele em ' + cat.label + ". Essa ação não tem como desfazer depois de salvar. Tem certeza?",
    function () {
      cat.players = cat.players.filter(function (p) { return p.id !== playerId; });
      DIRTY = true;
      renderAll();
    },
    "Remover atleta"
  );
}

function removeWeek(weekId) {
  var cat = currentCategory();
  var week = cat.weeks.filter(function (w) { return w.id === weekId; })[0];
  if (!week) return;
  var msg = isPendingWeek(week)
    ? 'Remover a rodada "' + week.label + '" descarta os times montados pra ela. Tem certeza?'
    : 'Remover a rodada "' + week.label + '" apaga o resultado de todo mundo nessa rodada. Essa ação não tem como desfazer depois de salvar. Tem certeza?';
  showConfirm("Remover rodada", msg, function () {
    cat.weeks = cat.weeks.filter(function (w) { return w.id !== weekId; });
    cat.players.forEach(function (p) { delete p.weeks[weekId]; });
    DIRTY = true;
    renderAll();
  }, "Remover rodada");
}

function openAddPlayerModal() {
  showModal(
    "Novo atleta",
    '<div class="field"><label for="new-player-name">Nome</label><input id="new-player-name" type="text" maxlength="40" placeholder="Ex: RODRIGO"></div>',
    function () {
      var input = document.getElementById("new-player-name");
      var name = input && input.value.trim();
      if (!name) return false;
      var cat = currentCategory();
      var id = "p-" + slugify(name) + "-" + Date.now().toString(36);
      cat.players.push({ id: id, name: name.toUpperCase(), weeks: {} });
      DIRTY = true;
      renderAll();
      return true;
    }
  );
}

function openRenamePlayerModal(playerId) {
  var cat = currentCategory();
  var player = cat.players.filter(function (p) { return p.id === playerId; })[0];
  if (!player) return;
  showModal(
    "Renomear atleta",
    '<div class="field"><label for="rename-player-name">Nome</label><input id="rename-player-name" type="text" maxlength="40" value="' +
      esc(player.name) +
      '"></div>',
    function () {
      var input = document.getElementById("rename-player-name");
      var name = input && input.value.trim();
      if (!name) return false;
      var newName = name.toUpperCase();
      var clash = cat.players.some(function (p) { return p.id !== player.id && p.name === newName; });
      if (clash) { showToast("Já existe um atleta com esse nome nessa categoria."); return false; }
      player.name = newName;
      DIRTY = true;
      renderAll();
      return true;
    },
    "Salvar"
  );
}

/* ---------- team rounds (montar times / lançar resultado) ---------- */

function newWeekId() {
  return "w-" + Date.now().toString(36) + "-" + Math.floor(Math.random() * 1000);
}

function computeWinnerFromScores(scoreA, scoreB) {
  if (scoreA === "" || scoreB === "" || scoreA === null || scoreB === null) return null;
  var a = Number(scoreA), b = Number(scoreB);
  if (isNaN(a) || isNaN(b)) return null;
  if (a > b) return "a";
  if (b > a) return "b";
  return "draw";
}

function applyRoundResult(cat, week, winner, scoreA, scoreB) {
  week.status = "final";
  week.winner = winner;
  if (scoreA !== undefined && scoreA !== null && scoreA !== "" && scoreB !== undefined && scoreB !== null && scoreB !== "") {
    week.result = scoreA + "x" + scoreB;
  }
  cat.players.forEach(function (p) {
    var team = teamOf(week, p.id);
    var val;
    if (!team) val = -1;
    else if (winner === "draw") val = 2;
    else if (team === winner) val = 3;
    else val = 1;
    p.weeks[week.id] = val;
  });
}

function newRoundDraft(label, teams) {
  return {
    label: label || "",
    simple: false,
    teams: teams || {},
    knowResult: false,
    scoreA: "",
    scoreB: "",
    pasteOpen: false,
    pasteText: "",
    pasteRows: null,
    pasteConfirmApply: false
  };
}

function openNewRoundModal() {
  var cat = currentCategory();
  renderRoundModal(cat, newRoundDraft(), null);
}

function openEditTeamsModal(weekId) {
  var cat = currentCategory();
  var week = cat.weeks.filter(function (w) { return w.id === weekId; })[0];
  if (!week) return;
  var teams = {};
  cat.players.forEach(function (p) {
    var t = teamOf(week, p.id);
    if (t) teams[p.id] = t;
  });
  renderRoundModal(cat, newRoundDraft(week.label, teams), week);
}

function openFinalizeModal(weekId) {
  var cat = currentCategory();
  var week = cat.weeks.filter(function (w) { return w.id === weekId; })[0];
  if (!week) return;
  var slot = document.getElementById("modal-slot");
  if (!slot) return;

  function draw() {
    var missing = missingFromTeams(cat, week);
    slot.innerHTML =
      '<div class="modal-backdrop" id="modal-backdrop"><div class="modal">' +
      "<h3>Lançar resultado — " + esc(week.label) + "</h3>" +
      '<div class="score-row">' +
      '<div class="field"><label>Placar Time A</label><input id="fin-score-a" type="number" min="0" max="99" inputmode="numeric"></div>' +
      '<span class="score-x">×</span>' +
      '<div class="field"><label>Placar Time B</label><input id="fin-score-b" type="number" min="0" max="99" inputmode="numeric"></div>' +
      "</div>" +
      (missing.length
        ? '<p class="missing-note">' + missing.length + " sem time (falta automática): " + missing.map(function (p) { return esc(p.name); }).join(", ") + "</p>"
        : "") +
      '<div class="modal-actions"><button type="button" class="btn btn-sm" id="modal-cancel">Cancelar</button><button type="button" class="btn btn-sm btn-accent" id="modal-confirm">Lançar resultado</button></div>' +
      "</div></div>";

    document.getElementById("modal-backdrop").addEventListener("click", function (e) {
      if (e.target.id === "modal-backdrop") close();
    });
    document.getElementById("modal-cancel").addEventListener("click", close);
    document.getElementById("modal-confirm").addEventListener("click", function () {
      var scoreA = document.getElementById("fin-score-a").value.trim();
      var scoreB = document.getElementById("fin-score-b").value.trim();
      var winner = computeWinnerFromScores(scoreA, scoreB);
      if (!winner) {
        showToast("Informe o placar dos dois times.");
        return;
      }
      applyRoundResult(cat, week, winner, scoreA, scoreB);
      DIRTY = true;
      close();
      renderAll();
    });
    var first = document.getElementById("fin-score-a");
    if (first) first.focus();
  }

  function close() { slot.innerHTML = ""; }
  draw();
}

function renderRoundModal(cat, draft, existingWeek) {
  var slot = document.getElementById("modal-slot");
  if (!slot) return;

  function teamBtnClass(pid) {
    var t = draft.teams[pid];
    if (t === "a") return "team-toggle-btn team-a";
    if (t === "b") return "team-toggle-btn team-b";
    return "team-toggle-btn";
  }
  function teamBtnLabel(pid) {
    var t = draft.teams[pid];
    if (t === "a") return "TIME A";
    if (t === "b") return "TIME B";
    return "sem time";
  }

  function optionsHtml(selectedVal) {
    return (
      '<option value="">(ignorar)</option>' +
      '<option value="__new__"' +
      (selectedVal === "__new__" ? " selected" : "") +
      ">+ novo atleta</option>" +
      cat.players
        .map(function (p) {
          return '<option value="' + p.id + '"' + (selectedVal === p.id ? " selected" : "") + ">" + esc(p.name) + "</option>";
        })
        .join("")
    );
  }

  function pasteSideHtml(rowIdx, side, raw, sel, suggest) {
    if (!raw) return '<div class="paste-review-side paste-review-side-empty"><span class="paste-raw">—</span></div>';
    var needsReview = sel === "__new__";
    var noteHtml = "";
    if (needsReview && suggest) {
      noteHtml =
        '<p class="paste-suggest">Não é exatamente igual, mas pode ser <strong>' +
        esc(suggest.name) +
        '</strong>. <button type="button" class="link-btn" data-suggest-row="' +
        rowIdx +
        '" data-suggest-side="' +
        side +
        '" data-suggest-id="' +
        suggest.id +
        '">Vincular com esse atleta?</button></p>';
    } else if (needsReview) {
      noteHtml = '<p class="paste-suggest paste-suggest-unknown">Não reconheci esse nome. É um atleta que já existe com outro nome? Escolha na lista, ou deixe como novo atleta.</p>';
    }
    return (
      '<div class="paste-review-side' + (needsReview ? " paste-needs-review" : "") + '">' +
      '<span class="paste-raw">' + esc(raw) + "</span>" +
      '<select data-paste-row="' + rowIdx + '" data-paste-side="' + side + '">' +
      optionsHtml(sel) +
      "</select>" +
      noteHtml +
      "</div>"
    );
  }

  function draw() {
    var missingCount = cat.players.filter(function (p) { return !draft.teams[p.id]; }).length;

    var pasteBlockHtml = "";
    if (!draft.simple && draft.pasteRows) {
      pasteBlockHtml =
        '<div class="paste-review">' +
        '<p class="team-builder-hint">Confira os nomes reconhecidos e ajuste o que precisar, depois aplique.</p>' +
        '<div class="paste-review-rows">' +
        draft.pasteRows
          .map(function (row, idx) {
            return (
              '<div class="paste-review-row">' +
              pasteSideHtml(idx, "a", row.aRaw, row.aSel, row.aSuggest) +
              '<span class="paste-review-x">×</span>' +
              pasteSideHtml(idx, "b", row.bRaw, row.bSel, row.bSuggest) +
              "</div>"
            );
          })
          .join("") +
        "</div>" +
        '<div class="modal-actions modal-actions-left"><button type="button" class="btn btn-sm btn-ghost" id="btn-cancel-paste">Cancelar colagem</button><button type="button" class="btn btn-sm btn-accent" id="btn-apply-paste">' +
        (draft.pasteConfirmApply ? "Confirmar e criar novos atletas" : "Aplicar times") +
        "</button></div>" +
        "</div>";
    } else if (!draft.simple && draft.pasteOpen) {
      pasteBlockHtml =
        '<div class="paste-panel">' +
        '<p class="team-builder-hint">Cole a lista dos dois times, uma dupla por linha (ex: "5 - Gui   x   2 - Mada"). O time da esquerda vira Time A, o da direita Time B.</p>' +
        '<textarea id="paste-textarea" class="paste-textarea" rows="6" placeholder="5 - Gui   x   2 - Mada&#10;9 - Evandro   x   3 - Fernando">' +
        esc(draft.pasteText) +
        "</textarea>" +
        '<div class="modal-actions modal-actions-left"><button type="button" class="btn btn-sm btn-ghost" id="btn-cancel-paste">Cancelar</button><button type="button" class="btn btn-sm btn-accent" id="btn-parse-paste">Reconhecer nomes</button></div>' +
        "</div>";
    }

    var teamBuilderHtml = draft.simple
      ? ""
      : '<div class="team-builder">' +
        '<div class="team-builder-toprow"><p class="team-builder-hint">Clique no nome para alternar entre Time A, Time B e sem time. Quem ficar sem time leva falta automática ao lançar o resultado.' +
        (missingCount ? ' <strong>' + missingCount + " sem time agora.</strong>" : "") +
        "</p>" +
        (draft.pasteOpen || draft.pasteRows
          ? ""
          : '<button type="button" class="link-btn" id="btn-toggle-paste">Colar lista dos times</button>') +
        "</div>" +
        pasteBlockHtml +
        '<div class="team-toggle-grid">' +
        cat.players
          .map(function (p) {
            return (
              '<button type="button" class="' +
              teamBtnClass(p.id) +
              '" data-team-player="' +
              p.id +
              '"><span class="team-toggle-name">' +
              esc(p.name) +
              '</span><span class="team-toggle-tag">' +
              teamBtnLabel(p.id) +
              "</span></button>"
            );
          })
          .join("") +
        "</div></div>";

    var resultHtml = draft.simple
      ? ""
      : '<label class="know-result-toggle"><input type="checkbox" id="know-result-check"' +
        (draft.knowResult ? " checked" : "") +
        "> Já sei o placar, lançar o resultado agora</label>" +
        (draft.knowResult
          ? '<div class="score-row">' +
            '<div class="field"><label>Placar Time A</label><input id="round-score-a" type="number" min="0" max="99" inputmode="numeric" value="' +
            esc(draft.scoreA) +
            '"></div>' +
            '<span class="score-x">×</span>' +
            '<div class="field"><label>Placar Time B</label><input id="round-score-b" type="number" min="0" max="99" inputmode="numeric" value="' +
            esc(draft.scoreB) +
            '"></div>' +
            "</div>"
          : "");

    slot.innerHTML =
      '<div class="modal-backdrop" id="modal-backdrop"><div class="modal modal-wide">' +
      "<h3>" + (existingWeek ? "Editar times" : "Nova rodada") + "</h3>" +
      '<div class="field"><label for="round-label">Data</label><input id="round-label" type="text" maxlength="16" placeholder="Ex: 26/Ago" value="' +
      esc(draft.label) +
      '"' + (existingWeek ? " disabled" : "") + "></div>" +
      (existingWeek
        ? ""
        : '<label class="know-result-toggle"><input type="checkbox" id="simple-mode-check"' +
          (draft.simple ? " checked" : "") +
          "> Modo simples (sem montar times agora)</label>") +
      teamBuilderHtml +
      resultHtml +
      '<div class="modal-actions"><button type="button" class="btn btn-sm" id="modal-cancel">Cancelar</button><button type="button" class="btn btn-sm btn-accent" id="modal-confirm">' +
      (existingWeek ? "Salvar times" : "Criar rodada") +
      "</button></div>" +
      "</div></div>";

    document.getElementById("modal-backdrop").addEventListener("click", function (e) {
      if (e.target.id === "modal-backdrop") close();
    });
    document.getElementById("modal-cancel").addEventListener("click", close);

    var labelInput = document.getElementById("round-label");
    if (labelInput) labelInput.addEventListener("input", function () { draft.label = labelInput.value; });

    var scoreAInputLive = document.getElementById("round-score-a");
    if (scoreAInputLive) scoreAInputLive.addEventListener("input", function () { draft.scoreA = scoreAInputLive.value; });
    var scoreBInputLive = document.getElementById("round-score-b");
    if (scoreBInputLive) scoreBInputLive.addEventListener("input", function () { draft.scoreB = scoreBInputLive.value; });

    var simpleCheck = document.getElementById("simple-mode-check");
    if (simpleCheck) simpleCheck.addEventListener("change", function () { draft.simple = simpleCheck.checked; draw(); });

    var knowCheck = document.getElementById("know-result-check");
    if (knowCheck) knowCheck.addEventListener("change", function () { draft.knowResult = knowCheck.checked; draw(); });

    var pasteTextarea = document.getElementById("paste-textarea");
    if (pasteTextarea) {
      pasteTextarea.addEventListener("input", function () { draft.pasteText = pasteTextarea.value; });
      pasteTextarea.focus();
    }

    var toggleOpenPaste = document.getElementById("btn-toggle-paste");
    if (toggleOpenPaste) toggleOpenPaste.addEventListener("click", function () { draft.pasteOpen = true; draw(); });

    var cancelPasteBtn = document.getElementById("btn-cancel-paste");
    if (cancelPasteBtn) {
      cancelPasteBtn.addEventListener("click", function () {
        draft.pasteOpen = false;
        draft.pasteRows = null;
        draft.pasteText = "";
        draw();
      });
    }

    var parsePasteBtn = document.getElementById("btn-parse-paste");
    if (parsePasteBtn) {
      parsePasteBtn.addEventListener("click", function () {
        var rows = parseTeamsPaste(draft.pasteText);
        if (!rows.length) { showToast("Não encontrei nenhuma dupla de nomes nesse texto."); return; }
        draft.pasteRows = rows.map(function (row) {
          var am = row.aRaw ? guessMatch(cat, row.aRaw) : null;
          var bm = row.bRaw ? guessMatch(cat, row.bRaw) : null;
          return {
            aRaw: row.aRaw,
            bRaw: row.bRaw,
            aSel: row.aRaw ? (am && am.score >= MATCH_AUTOLINK_THRESHOLD ? am.id : "__new__") : "",
            bSel: row.bRaw ? (bm && bm.score >= MATCH_AUTOLINK_THRESHOLD ? bm.id : "__new__") : "",
            aSuggest: am && am.score < MATCH_AUTOLINK_THRESHOLD ? am : null,
            bSuggest: bm && bm.score < MATCH_AUTOLINK_THRESHOLD ? bm : null
          };
        });
        draft.pasteConfirmApply = false;
        draw();
      });
    }

    Array.prototype.forEach.call(slot.querySelectorAll("[data-paste-row]"), function (sel) {
      sel.addEventListener("change", function () {
        var idx = Number(sel.getAttribute("data-paste-row"));
        var side = sel.getAttribute("data-paste-side");
        draft.pasteRows[idx][side + "Sel"] = sel.value;
        draft.pasteConfirmApply = false;
        draw();
      });
    });

    Array.prototype.forEach.call(slot.querySelectorAll("[data-suggest-row]"), function (btn) {
      btn.addEventListener("click", function () {
        var idx = Number(btn.getAttribute("data-suggest-row"));
        var side = btn.getAttribute("data-suggest-side");
        var pid = btn.getAttribute("data-suggest-id");
        draft.pasteRows[idx][side + "Sel"] = pid;
        draft.pasteConfirmApply = false;
        draw();
      });
    });

    var applyPasteBtn = document.getElementById("btn-apply-paste");
    if (applyPasteBtn) {
      applyPasteBtn.addEventListener("click", function () {
        var pendingSuggestions = 0;
        draft.pasteRows.forEach(function (row) {
          if (row.aSuggest && row.aSel === "__new__") pendingSuggestions++;
          if (row.bSuggest && row.bSel === "__new__") pendingSuggestions++;
        });
        if (pendingSuggestions && !draft.pasteConfirmApply) {
          draft.pasteConfirmApply = true;
          showToast(
            pendingSuggestions +
              (pendingSuggestions === 1 ? " nome parece ser um atleta que já existe" : " nomes parecem ser atletas que já existem") +
              " — confira as sugestões acima. Clique em \"Aplicar times\" de novo pra criar mesmo assim como novos atletas."
          );
          draw();
          return;
        }
        draft.pasteRows.forEach(function (row) {
          [
            ["a", row.aRaw, row.aSel],
            ["b", row.bRaw, row.bSel]
          ].forEach(function (entry) {
            var side = entry[0], raw = entry[1], sel = entry[2];
            if (!raw || !sel) return;
            var pid = sel;
            if (sel === "__new__") {
              var name = raw.toUpperCase();
              pid = "p-" + slugify(name) + "-" + Date.now().toString(36) + "-" + Math.floor(Math.random() * 1000);
              cat.players.push({ id: pid, name: name, weeks: {} });
            }
            draft.teams[pid] = side;
          });
        });
        draft.pasteRows = null;
        draft.pasteOpen = false;
        draft.pasteText = "";
        draft.pasteConfirmApply = false;
        DIRTY = true;
        draw();
      });
    }

    Array.prototype.forEach.call(slot.querySelectorAll("[data-team-player]"), function (btn) {
      btn.addEventListener("click", function () {
        var pid = btn.getAttribute("data-team-player");
        var t = draft.teams[pid];
        if (!t) draft.teams[pid] = "a";
        else if (t === "a") draft.teams[pid] = "b";
        else delete draft.teams[pid];
        draw();
      });
    });

    document.getElementById("modal-confirm").addEventListener("click", function () {
      var labelInput = document.getElementById("round-label");
      var label = existingWeek ? existingWeek.label : labelInput && labelInput.value.trim();
      if (!existingWeek && !label) { showToast("Coloque a data da rodada."); return; }

      var scoreAInput = document.getElementById("round-score-a");
      var scoreBInput = document.getElementById("round-score-b");
      var scoreA = scoreAInput ? scoreAInput.value.trim() : "";
      var scoreB = scoreBInput ? scoreBInput.value.trim() : "";

      if (existingWeek) {
        existingWeek.teams = { a: teamIds(draft, "a"), b: teamIds(draft, "b") };
        DIRTY = true;
        close();
        renderAll();
        return;
      }

      var week = { id: newWeekId(), label: label, result: "" };
      if (draft.simple) {
        week.status = "final";
      } else {
        week.teams = { a: teamIds(draft, "a"), b: teamIds(draft, "b") };
        if (draft.knowResult) {
          var winner = computeWinnerFromScores(scoreA, scoreB);
          if (!winner) { showToast("Informe o placar dos dois times."); return; }
          week.status = "pending";
          cat.weeks.push(week);
          applyRoundResult(cat, week, winner, scoreA, scoreB);
          DIRTY = true;
          close();
          renderAll();
          return;
        }
        week.status = "pending";
      }
      cat.weeks.push(week);
      DIRTY = true;
      close();
      renderAll();
    });

    var first = document.getElementById("round-label");
    if (first && !existingWeek) first.focus();
  }

  function teamIds(d, key) {
    return Object.keys(d.teams).filter(function (pid) { return d.teams[pid] === key; });
  }

  function close() { slot.innerHTML = ""; }
  draw();
}

function renderPendingRounds(cat) {
  var slot = document.getElementById("pending-rounds-slot");
  if (!slot) return;
  var pending = pendingWeeksOf(cat);
  if (!pending.length) { slot.innerHTML = ""; return; }

  slot.innerHTML = pending
    .map(function (w) {
      var teamA = cat.players.filter(function (p) { return teamOf(w, p.id) === "a"; });
      var teamB = cat.players.filter(function (p) { return teamOf(w, p.id) === "b"; });
      var missing = missingFromTeams(cat, w);
      var copyBtn = '<button type="button" class="btn btn-sm btn-ghost" data-copy-teams="' + w.id + '">Copiar lista</button>';
      var actions =
        EDIT_MODE && !READ_ONLY
          ? '<div class="pending-actions">' +
            copyBtn +
            '<button type="button" class="btn btn-sm" data-edit-teams="' + w.id + '">Editar times</button>' +
            '<button type="button" class="btn btn-sm btn-accent" data-finalize="' + w.id + '">Lançar resultado</button>' +
            '<button type="button" class="btn btn-sm btn-ghost btn-danger" data-remove-week="' + w.id + '">Remover</button>' +
            "</div>"
          : '<div class="pending-actions">' + copyBtn + "</div>";
      return (
        '<div class="pending-card">' +
        '<div class="pending-head"><span class="badge-pending">Aguardando resultado</span><span class="pending-date">' +
        esc(w.label) +
        "</span></div>" +
        '<div class="pending-teams">' +
        '<div class="team-col"><h4 class="team-col-title team-a-title">Time A</h4>' +
        (teamA.length ? teamA.map(function (p) { return '<span class="team-chip team-chip-a">' + esc(p.name) + "</span>"; }).join("") : '<span class="team-empty">ninguém ainda</span>') +
        "</div>" +
        '<div class="team-col"><h4 class="team-col-title team-b-title">Time B</h4>' +
        (teamB.length ? teamB.map(function (p) { return '<span class="team-chip team-chip-b">' + esc(p.name) + "</span>"; }).join("") : '<span class="team-empty">ninguém ainda</span>') +
        "</div>" +
        "</div>" +
        (missing.length ? '<p class="missing-note">Sem time (falta automática se o resultado for lançado agora): ' + missing.map(function (p) { return esc(p.name); }).join(", ") + "</p>" : "") +
        actions +
        "</div>"
      );
    })
    .join("");

  Array.prototype.forEach.call(slot.querySelectorAll("[data-edit-teams]"), function (btn) {
    btn.addEventListener("click", function () { openEditTeamsModal(btn.getAttribute("data-edit-teams")); });
  });
  Array.prototype.forEach.call(slot.querySelectorAll("[data-finalize]"), function (btn) {
    btn.addEventListener("click", function () { openFinalizeModal(btn.getAttribute("data-finalize")); });
  });
  Array.prototype.forEach.call(slot.querySelectorAll("[data-remove-week]"), function (btn) {
    btn.addEventListener("click", function () { removeWeek(btn.getAttribute("data-remove-week")); });
  });
  Array.prototype.forEach.call(slot.querySelectorAll("[data-copy-teams]"), function (btn) {
    btn.addEventListener("click", function () { copyTeamsList(cat, btn.getAttribute("data-copy-teams")); });
  });
}

/* Formats a pending round's two teams as plain text in the same
   "N -Nome x N - Nome" paired style the group uses on WhatsApp, so the
   admin can paste it straight back into the chat before the match. */
function formatTeamsForCopy(cat, week) {
  var teamA = cat.players.filter(function (p) { return teamOf(week, p.id) === "a"; });
  var teamB = cat.players.filter(function (p) { return teamOf(week, p.id) === "b"; });
  var max = Math.max(teamA.length, teamB.length);
  var lines = ["Times " + week.label + ":", ""];
  for (var i = 0; i < max; i++) {
    var left = teamA[i] ? teamA[i].name : "";
    var right = teamB[i] ? teamB[i].name : "";
    if (left && right) lines.push(left + " x " + right);
    else if (left) lines.push(left);
    else if (right) lines.push("x " + right);
  }
  var missing = missingFromTeams(cat, week);
  if (missing.length) {
    lines.push("");
    lines.push("De fora: " + missing.map(function (p) { return p.name; }).join(", "));
  }
  return lines.join("\n");
}

function copyTeamsList(cat, weekId) {
  var week = cat.weeks.filter(function (w) { return w.id === weekId; })[0];
  if (!week) return;
  copyTextOrShow("Lista de times", formatTeamsForCopy(cat, week));
}

function showModal(title, bodyHtml, onConfirm, confirmLabel) {
  var slot = document.getElementById("modal-slot");
  if (!slot) return;
  slot.innerHTML =
    '<div class="modal-backdrop" id="modal-backdrop"><div class="modal"><h3>' +
    esc(title) +
    "</h3>" +
    bodyHtml +
    '<div class="modal-actions"><button type="button" class="btn btn-sm" id="modal-cancel">Cancelar</button><button type="button" class="btn btn-sm btn-accent" id="modal-confirm">' +
    esc(confirmLabel || "Adicionar") +
    "</button></div></div></div>";

  function close() { slot.innerHTML = ""; }

  document.getElementById("modal-backdrop").addEventListener("click", function (e) {
    if (e.target.id === "modal-backdrop") close();
  });
  document.getElementById("modal-cancel").addEventListener("click", close);
  document.getElementById("modal-confirm").addEventListener("click", function () {
    var ok = onConfirm();
    if (ok !== false) close();
  });
  var firstInput = slot.querySelector("input");
  if (firstInput) firstInput.focus();
}

function showConfirm(title, message, onConfirm, confirmLabel) {
  var slot = document.getElementById("modal-slot");
  if (!slot) return;
  slot.innerHTML =
    '<div class="modal-backdrop" id="modal-backdrop"><div class="modal"><h3>' +
    esc(title) +
    '</h3><p class="confirm-message">' +
    esc(message) +
    '</p><div class="modal-actions"><button type="button" class="btn btn-sm" id="modal-cancel">Cancelar</button><button type="button" class="btn btn-sm btn-danger-solid" id="modal-confirm">' +
    esc(confirmLabel || "Remover") +
    "</button></div></div></div>";

  function close() { slot.innerHTML = ""; }

  document.getElementById("modal-backdrop").addEventListener("click", function (e) {
    if (e.target.id === "modal-backdrop") close();
  });
  document.getElementById("modal-cancel").addEventListener("click", close);
  document.getElementById("modal-confirm").addEventListener("click", function () {
    onConfirm();
    close();
  });
}

/* Copies text to the clipboard when the API is available and permitted;
   otherwise (or on failure) falls back to a modal with a selectable
   textarea so the admin can copy it by hand. */
function copyTextOrShow(title, text) {
  function showFallback() {
    var slot = document.getElementById("modal-slot");
    if (!slot) return;
    slot.innerHTML =
      '<div class="modal-backdrop" id="modal-backdrop"><div class="modal modal-wide"><h3>' +
      esc(title) +
      '</h3><p class="team-builder-hint">Selecione e copie o texto abaixo.</p>' +
      '<textarea class="paste-textarea" id="copy-textarea" rows="12" readonly>' +
      esc(text) +
      "</textarea>" +
      '<div class="modal-actions"><button type="button" class="btn btn-sm btn-accent" id="modal-cancel">Fechar</button></div></div></div>';
    document.getElementById("modal-backdrop").addEventListener("click", function (e) {
      if (e.target.id === "modal-backdrop") slot.innerHTML = "";
    });
    document.getElementById("modal-cancel").addEventListener("click", function () { slot.innerHTML = ""; });
    var ta = document.getElementById("copy-textarea");
    if (ta) { ta.focus(); ta.select(); }
  }

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(
      function () { showToast("Lista copiada! Já pode colar no grupo."); },
      function () { showFallback(); }
    );
  } else {
    showFallback();
  }
}

function showToast(msg) {
  var slot = document.getElementById("toast-slot");
  if (!slot) return;
  slot.innerHTML = '<div class="toast">' + esc(msg) + "</div>";
  setTimeout(function () {
    if (slot) slot.innerHTML = "";
  }, 4200);
}

/* ---------- persistence ---------- */

function todayLabel() {
  try {
    return new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
  } catch (e) {
    return "";
  }
}

async function saveEdit() {
  if (!DIRTY) { EDIT_MODE = false; renderAll(); return; }
  STATE.updatedAt = todayLabel();
  var html = buildStandaloneHTML(STATE);

  if (!ARTIFACT_NS) {
    showToast("Não foi possível salvar por aqui — abra este Racha como artifact publicado.");
    return;
  }
  try {
    await ARTIFACT_NS.publish(html);
    /* success reloads every view, including this one */
  } catch (err) {
    var code = err && err.code;
    if (code === "not_writer" || code === "not_granted") {
      READ_ONLY = true;
      EDIT_MODE = false;
      DIRTY = false;
      showToast("Só quem administra este Racha pode salvar. Você está no modo leitura.");
      renderAll();
    } else if (code === "conflict") {
      showToast("Alguém salvou uma versão mais nova — atualizando...");
    } else if (code === "rate_limited") {
      showToast("Calma, várias alterações seguidas. Aguarde um instante e tente salvar de novo.");
    } else {
      showToast("Não deu para salvar agora (" + (code || "erro") + "). Tente de novo em instantes.");
    }
  }
}

/* ---------- boot ---------- */

async function boot(seedState) {
  STATE = seedState;
  if (!(window.claude && typeof window.claude.use === "function")) {
    /* No Claude runtime available (e.g. a plain static hosting like
       Vercel) — there is no way to publish edits from the browser here,
       so the page is view-only. Editing happens by regenerating and
       redeploying the site. */
    READ_ONLY = true;
  }
  renderAll();

  document.addEventListener(
    "click",
    function (e) {
      if (EDIT_MODE && !document.getElementById("btn-enter-edit")) {
        var within = e.target.closest && (e.target.closest("#root") || e.target.closest("#modal-slot"));
      }
    },
    true
  );

  wireEnterEditGuard();

  try {
    if (window.claude && typeof window.claude.use === "function") {
      ARTIFACT_NS = await window.claude.use("artifact");
    }
  } catch (e) {
    ARTIFACT_NS = null;
  }

  try {
    if (window.claude && typeof window.claude.use === "function") {
      DOWNLOADS_NS = await window.claude.use("downloads");
      renderToolbar();
    }
  } catch (e) {
    DOWNLOADS_NS = null;
  }
}

function wireEnterEditGuard() {
  document.addEventListener("click", function (e) {
    var btn = e.target.closest && e.target.closest("#btn-enter-edit");
    if (btn && !SNAPSHOT_BEFORE_EDIT) {
      SNAPSHOT_BEFORE_EDIT = JSON.stringify(STATE);
    }
  });
}

/* ---------- standalone document builder ---------- */

function jsStringLiteral(s) {
  return JSON.stringify(s).replace(/</g, "\\u003c");
}

function buildStandaloneHTML(state) {
  var headerConsts =
    "const CSS_TEXT = " + jsStringLiteral(CSS_TEXT) + ";\n" +
    "const BODY_SHELL = " + jsStringLiteral(BODY_SHELL) + ";\n" +
    "const LOGIC_SRC = " + jsStringLiteral(LOGIC_SRC) + ";\n";
  var script = headerConsts + LOGIC_SRC + "\nboot(JSON.parse(" + jsStringLiteral(JSON.stringify(state)) + "));";
  return (
    "<!doctype html>\n" +
    '<html lang="pt-BR">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
    "<title>Racha 2026</title>\n" +
    '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Oswald:wght@500;600;700&family=Public+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@500;600;700&display=swap">\n' +
    "<style>" + CSS_TEXT + "</style>\n</head>\n<body>\n" +
    BODY_SHELL +
    "\n<script>" + script + "<\/script>\n" +
    "</body>\n</html>"
  );
}
