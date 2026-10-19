
/**
 * QA-UI-001
 * Purpose: Render all Qualis application pages.
 * Depends on: engine.js and scorecard.js.
 * Impact: User interface only, not evaluation decisions.
 * Safeguard: All imported transcript text is escaped.
 * Version: 2.0
 */

import { GROUPS } from "../config/scorecard.js";
import { agentStats } from "../core/engine.js";

export const esc = s =>
  String(s ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[c]));

const displayScore = s =>
  s?.value == null ? "—" : s.value + "%";

/**
 * QA-UI-002
 * Purpose: Dashboard summary and agent overview.
 */
export function overview(calls) {
  const done = calls.filter(c => c.status === "COMPLETE");
  const agents = agentStats(calls);

  const scores = done
    .map(c => c.score?.value)
    .filter(x => x != null);

  const avg = scores.length
    ? Math.round(
        scores.reduce((a, b) => a + b, 0) / scores.length
      ) + "%"
    : "—";

  return `
    <div class="grid">
      <div class="metric">
        <label>Interactions imported</label>
        <strong>${calls.length}</strong>
        <small>Across uploaded export</small>
      </div>
      <div class="metric">
        <label>Agents detected</label>
        <strong>${agents.length}</strong>
        <small>Unique internal participants</small>
      </div>
      <div class="metric">
        <label>Evaluations complete</label>
        <strong>${done.length}</strong>
        <small>Live assessments</small>
      </div>
      <div class="metric">
        <label>Average verified score</label>
        <strong>${avg}</strong>
        <small>Coverage must be reviewed</small>
      </div>
    </div>

    <div class="panel" style="margin-top:16px">
      <div class="panel-head">
        <h2>Agent quality overview</h2>
        <button class="btn" data-action="go-evaluation">
          + Evaluate transcripts
        </button>
      </div>
      ${agentTable(agents)}
    </div>

    <div class="notice">
      Scores use only assessable criteria.
      Voice tone, hold events, system activity and policy accuracy
      are not asserted from text alone.
    </div>`;
}

function agentTable(agents) {
  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Agent</th>
            <th>Calls</th>
            <th>Evaluated</th>
            <th>Avg QA</th>
            <th>Coverage</th>
          </tr>
        </thead>
        <tbody>
          ${agents.map(a => `
            <tr>
              <td><b>${esc(a.name)}</b></td>
              <td>${a.calls}</td>
              <td>${a.complete}</td>
              <td>${a.average == null ? "—" : a.average + "%"}</td>
              <td>${a.coverage == null ? "—" : a.coverage + "%"}</td>
            </tr>
          `).join("") || `
            <tr>
              <td colspan="5">
                Upload interactions to populate performance.
              </td>
            </tr>
          `}
        </tbody>
      </table>
    </div>`;
}

/**
 * QA-UI-003
 * Purpose: Batch upload, progress, interaction queue and AI animation.
 * Depends on: app.js supplying live call state.
 */
export function evaluation(
  calls,
  selected,
  stage = "idle",
  message = "Awaiting transcript"
) {
  const ready = calls.filter(c => c.status === "READY").length;
  const complete = calls.filter(c => c.status === "COMPLETE").length;

  const done = calls.filter(c =>
    ["COMPLETE", "ERROR", "DUPLICATE", "NO_TRANSCRIPT"]
      .includes(c.status)
  ).length;

  const pct = calls.length
    ? Math.round(done / calls.length * 100)
    : 0;

  return `
    <div class="split">
      <section>
        <div class="panel">
          <div class="panel-head">
            <h2>Interaction intake</h2>
            <span class="pill outline">GENESYS EXPORT</span>
          </div>

          <div class="drop">
            <strong>Upload contact-centre transcripts</strong>
            <p>
              One TXT or TSV export · multiple agents and interactions
              · automatic separation
            </p>
            <input id="upload" type="file" accept=".txt,.tsv">
          </div>

          <div class="actions" style="margin-top:15px">
            <button class="btn" id="start"
              ${ready ? "" : "disabled"}>
              ✧ Evaluate all (${ready})
            </button>
            <button class="btn secondary" id="stop" disabled>
              Stop
            </button>
            <button class="btn ghost" id="export"
              ${calls.length ? "" : "disabled"}>
              Export results
            </button>
          </div>
          <p class="tiny muted" id="uploadStatus">
            ${calls.length} imported · ${ready} ready ·
            ${complete} evaluated
          </p>
        </div>

        <div class="panel">
          <div class="panel-head">
            <h2>Interaction queue</h2>
            <span class="pill outline">${calls.length} records</span>
          </div>
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Agent</th>
                  <th>Conversation</th>
                  <th>Duration</th>
                  <th>QA</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                ${calls.map(c => `
                  <tr data-id="${esc(c.key)}"
                    class="${selected === c.key ? "highlight" : ""}">
                    <td><b>${esc(c.agent)}</b></td>
                    <td>${esc(c.id.slice(0, 13))}</td>
                    <td>${esc(c.duration || "—")}</td>
                    <td>${displayScore(c.score)}</td>
                    <td>
                      <span class="pill ${
                        c.status === "ERROR" ? "fail"
                        : c.status === "COMPLETE" ? ""
                        : "nv"
                      }">${esc(c.status)}</span>
                    </td>
                  </tr>
                `).join("") || `
                  <tr>
                    <td colspan="5">No file uploaded yet</td>
                  </tr>
                `}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section>
        <div class="orb-panel"
          data-state="${
            stage === "error" ? "error"
            : stage === "complete" ? "done"
            : stage === "idle" ? "idle" : "working"
          }" id="agentOrb">

          <div class="orb-wrap">
            <div class="orbit"></div>
            <div class="orbit two"></div>
            <div class="orb">✧</div>
          </div>

          <strong>Qualis AI Agent</strong>
          <p id="aiStage">${esc(message)}</p>
        </div>

        <div class="panel">
          <div class="panel-head">
            <h2>Live batch assessment</h2>
            <span class="pill">${pct}% processed</span>
          </div>

          <div class="grid"
            style="grid-template-columns:repeat(2,minmax(0,1fr))">
            <div class="metric">
              <label>Completed</label>
              <strong>${complete}</strong>
            </div>
            <div class="metric">
              <label>Total</label>
              <strong>${calls.length}</strong>
            </div>
          </div>

          <div class="progress" style="margin:17px 0 9px">
            <div style="width:${pct}%"></div>
          </div>
          <p class="tiny muted">
            Progress reflects actual completed or skipped records,
            not artificial AI timing.
          </p>
        </div>
      </section>
    </div>

    <div class="panel">
      <div class="panel-head">
        <h2>Agent performance</h2>
        <span class="tiny muted">
          Updated as evaluations finish
        </span>
      </div>
      ${agentTable(agentStats(calls))}
    </div>

    <div class="panel" id="detail">
      <div class="panel-head">
        <h2>Call QA assessment</h2>
        <span class="tiny muted">Select any call above</span>
      </div>
      ${detail(calls.find(c => c.key === selected))}
    </div>`;
}

/**
 * QA-UI-004
 * Purpose: Show selected call transcript and evidence-linked QA.
 */
function detail(call) {
  if (!call) {
    return `<p class="muted">
      Select an interaction to view its transcript and QA results.
    </p>`;
  }

  return `
    <div class="actions">
      <span class="pill outline">${esc(call.agent)}</span>
      <span class="pill outline">${esc(call.id)}</span>
      <span class="pill outline">
        ${esc(call.duration || "Duration unavailable")}
      </span>
      <span class="pill">
        ${displayScore(call.score)} ·
        Coverage ${call.score?.coverage ?? 0}%
      </span>
    </div>

    ${call.error ? `
      <div class="notice warning">
        ${esc(call.error)}
      </div>` : ""}

    <div class="double" style="margin-top:19px">
      <section>
        <h3>Transcript · ${call.turns.length} turns</h3>
        <div class="transcript">
          ${call.turns.map(t => `
            <div class="turn ${t.speaker}">
              <div class="stamp">
                ${esc(t.timestamp || "—")} ·
                Turn ${t.line} ·
                ${esc(t.speaker)}
              </div>
              <div dir="auto">${esc(t.text)}</div>
            </div>
          `).join("") ||
          `<p class="muted">No transcript turns.</p>`}
        </div>
      </section>

      <section>
        <h3>QA findings · ${call.findings.length}</h3>
        <div class="transcript">
          ${call.findings.map(f => `
            <div class="find">
              <div class="find-top">
                <div>
                  <small class="muted">${esc(f.group)}</small>
                  <h3>${esc(f.name)}</h3>
                </div>
                <span class="pill ${
                  f.status === "FAIL" ? "fail"
                  : f.status === "PASS" ? ""
                  : "nv"
                }">${esc(f.status)}</span>
              </div>
              <p>${esc(f.reason)}</p>

              ${(f.evidence || []).map(e => `
                <div class="quote" dir="auto">
                  <b>Turn ${Number(e.line) || "?"}</b>
                  <div>${esc(e.quote)}</div>
                </div>
              `).join("")}

              ${f.coaching ? `
                <p>
                  <b>Coaching:</b> ${esc(f.coaching)}
                </p>` : ""}
            </div>
          `).join("") || `
            <p class="muted">
              This interaction has not been evaluated.
            </p>
          `}
        </div>
      </section>
    </div>`;
}

export function refreshDetail(call) {
  const el = document.querySelector("#detail");

  if (el) {
    el.innerHTML = `
      <div class="panel-head">
        <h2>Call QA assessment</h2>
      </div>
      ${detail(call)}`;
  }
}

/**
 * QA-UI-005
 * Purpose: Editable QA criteria, deterministic rules and AI settings.
 * Depends on: config/scorecard.js.
 */
export function configuration(
  cfg,
  group = GROUPS[0],
  id = null
) {
  const active =
    cfg.criteria.find(c => c.id === id) ||
    cfg.criteria.find(c => c.group === group);

  const current = active?.group || group;

  return `
    <div class="config-grid">
      <div class="panel">
        <h2>QA scorecard</h2>
        <p class="tiny muted">
          7 main criteria · 27 parameters
        </p>

        ${GROUPS.map(g => `
          <button class="category ${
            g === current ? "active" : ""
          }" data-group="${esc(g)}">
            ${esc(g)}
            <span>
              ${cfg.criteria.filter(c => c.group === g).length}
            </span>
          </button>
        `).join("")}

        <div class="divider"></div>
        <h3>${esc(current)}</h3>

        ${cfg.criteria
          .filter(c => c.group === current)
          .map(c => `
            <div class="criteria-row ${
              c.id === active.id ? "active" : ""
            }">
              <input type="checkbox"
                data-toggle="${esc(c.id)}"
                ${c.enabled ? "checked" : ""}>
              <button data-criterion="${esc(c.id)}">
                ${esc(c.name)}
              </button>
            </div>
          `).join("")}
      </div>

      <div>
        <div class="panel">
          <div class="panel-head">
            <h2>Parameter editor</h2>
            <span class="pill outline">${esc(active.id)}</span>
          </div>

          <label class="field">Main criteria</label>
          <input value="${esc(current)}" disabled>

          <label class="field">Parameter name</label>
          <input id="cName" value="${esc(active.name)}">

          <label class="field">Definition</label>
          <textarea id="cDefinition">${
            esc(active.definition)
          }</textarea>

          <label class="field">Do / Don't guidance</label>
          <textarea id="cGuidance">${
            esc(active.guidance)
          }</textarea>

          <div class="double">
            <div>
              <label class="field">Weight</label>
              <input id="cWeight" type="number"
                min="0" max="100"
                value="${active.weight}">
            </div>
            <div>
              <label class="field">Evaluation method</label>
              <input value="${
                esc(active.type.toUpperCase())
              }" disabled>
            </div>
          </div>

          <label class="field">
            Criterion-specific Gemini instructions
          </label>
          <textarea id="cAI">${
            esc(active.aiInstructions || "")
          }</textarea>

          <div class="actions">
            <button class="btn" id="saveParameter">
              Save parameter
            </button>
            <span class="tiny muted" id="saveMsg"></span>
          </div>
        </div>

        <div class="panel">
          <h2>Rules Engine · editable conditions</h2>

          <div class="double">
            <div>
              <label class="field">
                Greeting within (seconds)
              </label>
              <input type="number" id="rGreeting"
                min="0" max="60"
                value="${cfg.rules.greeting7}">
            </div>
            <div>
              <label class="field">
                Fallback greeting (seconds)
              </label>
              <input type="number" id="rFallback"
                min="0" max="60"
                value="${cfg.rules.greeting10}">
            </div>
          </div>

          ${[
            "intro", "ack", "survey", "assistance", "closing"
          ].map(k => `
            <label class="field">
              ${esc(k)} accepted phrases · one per line
            </label>
            <textarea data-rule="${k}">${
              esc((cfg.rules[k] || []).join("\n"))
            }</textarea>
          `).join("")}

          <button class="btn secondary" id="saveRules">
            Save rule settings
          </button>
          <p class="tiny muted">
            Exact phrase rules are lexical.
            Gemini evaluates contextual behaviour independently.
          </p>
        </div>

        <div class="panel">
          <h2>AI Evaluator · IMCompanion-style settings</h2>

          <label class="field">Model</label>
          <select id="model">
            <option value="gemini-2.5-flash-lite"
              ${cfg.model === "gemini-2.5-flash-lite"
                ? "selected" : ""}>
              Gemini 2.5 Flash-Lite
            </option>
            <option value="gemini-2.5-flash"
              ${cfg.model === "gemini-2.5-flash"
                ? "selected" : ""}>
              Gemini 2.5 Flash
            </option>
          </select>

          <label class="field">Global AI instructions</label>
          <textarea id="instructions">${
            esc(cfg.instructions)
          }</textarea>

          <button class="btn secondary" id="saveAI">
            Save AI settings
          </button>
        </div>
      </div>
    </div>`;
}
