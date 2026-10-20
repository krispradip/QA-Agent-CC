/**
 * QA-UI-001 | Qualis v2.2.0
 *
 * Presentation layer.
 * Depends on config.js and engine.js.
 *
 * Uploaded dialogue is escaped before insertion
 * into HTML to avoid executing transcript content.
 */

import { GROUPS, MODES, DETERMINISTIC_RULES, linkedRules } from "./config.js";
import { agents } from "./engine.js";
import { renderDashboardSummary, renderScoreExplanation } from "./summary.js";
import { coverageBreakdown } from "./reporting.js";

export const esc = value =>
  String(value ?? "").replace(
    /[&<>"']/g,
    ch => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[ch])
  );

const fmt = value =>
  value === null || value === undefined
    ? "—"
    : `${value}%`;

const count = (calls, status) =>
  calls.filter(c => c.status === status).length;

const chip = status => `
  <span class="status status-${esc(
    String(status).toLowerCase()
  )}">
    ${esc(status)}
  </span>
`;

const card = (label, value, sub) => `
  <article class="metric">
    <span>${esc(label)}</span>
    <strong>${esc(value)}</strong>
    <small>${esc(sub)}</small>
  </article>
`;

/**
 * QA-UI-AGENT-TABLE
 * Shared agent summary across dashboard and insights.
 */
function tableAgents(calls) {
  const rows = agents(calls);

  return `
    <div class="table-scroll">
      <table>
        <thead>
          <tr>
            <th>AGENT</th>
            <th>INTERACTIONS</th>
            <th>EVALUATED</th>
            <th>QA SCORE</th>
            <th>COVERAGE</th>
            <th></th>
          </tr>
        </thead>

        <tbody>
          ${rows.map(a => `
            <tr>
              <td>
                <b>${esc(a.agent)}</b>
              </td>

              <td>${a.imported}</td>
              <td>${a.completed}</td>

              <td>
                <strong>${fmt(a.average)}</strong>
              </td>

              <td>${fmt(a.coverage)}</td>

              <td>
                <button class="link"
                  data-agent="${esc(a.agent)}">
                  Inspect →
                </button>
              </td>
            </tr>
          `).join("") || `
            <tr>
              <td colspan="6" class="empty">
                No interactions imported yet.
              </td>
            </tr>
          `}
        </tbody>
      </table>
    </div>
  `;
}

/**
 * QA-UI-OVERVIEW
 * Executive contact-centre quality view.
 */
export function overview(calls, rubric, selectedAgent = "", period = { mode:"all" }, periodInfo = {}) {
  const completed = calls.filter(c =>
    c.status === "COMPLETE" &&
    c.score?.score !== null
  );

  const mean = key =>
    completed.length
      ? Math.round(
          completed.reduce(
            (sum, c) => sum + c.score[key],
            0
          ) / completed.length
        )
      : null;

  const issues = (selectedAgent ? calls.filter(c => c.agent === selectedAgent) : calls)
    .filter(c => c.status === "COMPLETE")
    .flatMap(c =>
      c.findings
        .filter(f =>
          f.status === "SCORED" &&
          f.score <= 50
        )
        .map(f => ({
          agent: c.agent,
          name: (
            c.meta?.criteria || rubric.criteria
          ).find(x => x.id === f.id)?.name || f.id,
          score: f.score,
          reason: f.reason
        }))
    )
    .slice(0, 5);

  return `
    <section class="hero">
      <div>
        <div class="eyebrow">
          QUALIS / QUALITY CONTROL CENTRE
        </div>

        <h2>
          Every conversation.
          <br>
          <em>A clearer quality picture.</em>
        </h2>

        <p>
          Assess complete Genesys exports, trace every
          scored observation to dialogue, and help agents
          improve with defensible evidence.
        </p>

        <button class="primary pale"
          data-page-go="studio">
          ✦ Open Evaluation Studio ↗
        </button>
      </div>

      <div class="hero-logo">
        <span>Q</span>
        <small>EVIDENCE → QUALITY</small>
      </div>
    </section>

    <section class="panel"><div class="panel-heading"><div><span class="kicker">REPORTING PERIOD</span><h3>Interaction date</h3></div><button id="clearHistory" class="secondary">Clear saved history</button></div><div class="filters"><select id="report-period"><option value="all" ${period.mode==="all"?"selected":""}>All time</option><option value="last7" ${period.mode==="last7"?"selected":""}>Last 7 days</option><option value="last30" ${period.mode==="last30"?"selected":""}>Last 30 days</option><option value="month" ${period.mode==="month"?"selected":""}>This month</option><option value="custom" ${period.mode==="custom"?"selected":""}>Custom date range</option></select>${period.mode==="custom"?`<label>From <input type="date" id="period-from" value="${esc(period.from||"")}"></label><label>To <input type="date" id="period-to" value="${esc(period.to||"")}"></label>`:""}</div><p class="muted">Uses interaction dates, not evaluation dates. ${periodInfo.undatedExcluded||0} undated records excluded. ${esc(periodInfo.warning||"")}</p></section>
    ${renderDashboardSummary(calls, selectedAgent)}

    <section class="panel">
      <div class="panel-heading">
        <div>
          <span class="kicker">AGENT QUALITY</span>
          <h3>Performance overview</h3>
        </div>

        <button class="link"
          data-page-go="agents">
          View all agents →
        </button>
      </div>

      ${tableAgents(selectedAgent ? calls.filter(c => c.agent === selectedAgent) : calls)}
    </section>

    <section class="panel">
      <div class="panel-heading">
        <div>
          <span class="kicker">REQUIRES ATTENTION</span>
          <h3>Evidence-based coaching signals</h3>
        </div>

        <span class="muted">
          Only completed evaluations
        </span>
      </div>

      ${issues.length
        ? issues.map(x => `
          <div class="issue">
            <span>!</span>
            <div>
              <b>
                ${esc(criterionLabel(x,rubric))} · ${x.score}%
              </b>
              <small>
                ${esc(x.agent)} —
                ${esc(x.reason)}
              </small>
            </div>
          </div>
        `).join("")
        : `
          <div class="empty">
            No scored coaching opportunities yet.
            Evaluate an interaction to populate this area.
          </div>
        `
      }
    </section>
  `;
}

/**
 * QA-UI-AI-AGENT
 * Visual processing state tied to real workflow events.
 */
function aiPanel(phase, message) {
  const active = [
    "rules",
    "ai",
    "validating",
    "loading"
  ].includes(phase);

  return `
    <div class="ai-panel
      ${active ? "active" : ""}
      ${phase === "error" ? "error" : ""}">

      <div class="ai-panel-head">
        <span>✦ QUALIS EVALUATOR</span>
        <span>GEMINI · LIVE</span>
      </div>

      <div class="orb-field">
        <div class="ring ring-one"></div>
        <div class="ring ring-two"></div>
        <div class="orb">✦</div>
        <span class="spark"></span>
      </div>

      <h3>
        ${active
          ? "Analysing interaction"
          : "Ready to evaluate"}
      </h3>

      <p id="ai-stage">${esc(message)}</p>

      <div class="ai-steps">
        <span>01 Ingest</span>
        <span>02 Observe</span>
        <span>03 Score</span>
      </div>
    </div>
  `;
}

/**
 * QA-UI-STUDIO
 * Batch intake, individual evaluation,
 * real processing progress and interaction queue.
 */
export function studio(state) {
  const {
    calls,
    selected,
    running,
    phase,
    message,
    search,
    agentFilter
  } = state;

  const ready = count(calls, "READY");
  const done = count(calls, "COMPLETE");
  const failures = count(calls, "ERROR");

  const handled = calls.filter(c =>
    [
      "COMPLETE",
      "ERROR",
      "NO_TRANSCRIPT",
      "DUPLICATE"
    ].includes(c.status)
  ).length;

  const pct = calls.length
    ? Math.round(
        100 * handled / calls.length
      )
    : 0;

  const canEvaluateSelected = !running &&
    calls.some(c =>
      c.key === selected &&
      ["READY", "ERROR", "COMPLETE"].includes(c.status)
    );

  return `
    <div class="studio">
      <div>
        <section class="panel">
          <div class="panel-heading">
            <div>
              <span class="kicker">
                01 / INTERACTION INTAKE
              </span>

              <h3>Upload Genesys conversations</h3>
            </div>

            <span class="tag">MULTI-AGENT FILE</span>
          </div>

          <label class="upload" for="file">
            <span>⇧</span>
            <b>Choose one transcript export</b>

            <small>
              TXT / TSV / CSV / JSON / SRT /
              VTT / MD · speaker-labelled
            </small>

            <em>Browse file →</em>
          </label>

          <input
            id="file"
            type="file"
            accept=".txt,.tsv,.csv,.json,.srt,.vtt,.md,.log"
            hidden
            ${running ? "disabled" : ""}>

          <div class="paste-expander">
            <details>
              <summary>
                Or paste a speaker-labelled transcript
              </summary>

              <textarea id="paste" rows="6"
                placeholder="Agent: Hello, welcome to SHARE.
Customer: I need help with points.">${esc(state.pasteDraft || "")}</textarea>

              <button class="secondary"
                id="pasteLoad">
                Import pasted transcript
              </button>
              <p id="import-feedback" class="muted" role="status" aria-live="polite">${esc(state.importFeedback || "")}</p>
            </details>
          </div>

          <div class="toolbar">
            <button class="primary"
              id="all"
              ${ready && !running ? "" : "disabled"}>
              ✦ Evaluate all (${ready})
            </button>

            <button class="secondary"
              id="demo"
              ${running ? "disabled" : ""}>
              Load sample
            </button>

            <button class="secondary"
              id="one"
              ${canEvaluateSelected ? "" : "disabled"}>
              ${calls.find(c => c.key === selected)?.status === "COMPLETE"
                ? "Re-evaluate selected" : "Evaluate selected"}
            </button>

            <button class="secondary"
              id="stop"
              ${running ? "" : "disabled"}>
              Stop
            </button>

            <button class="secondary"
              id="json"
              ${calls.length ? "" : "disabled"}>
              Export JSON
            </button>

            <button class="secondary"
              id="csv"
              ${done ? "" : "disabled"}>
              CSV
            </button>
          </div>

          <div class="footnote">
            PII masking is basic and does not replace
            enterprise DLP. Use synthetic or approved
            anonymised files for the demo.
          </div>
        </section>

        <section class="panel">
          <div class="panel-heading">
            <div>
              <span class="kicker">
                02 / EVALUATION QUEUE
              </span>

              <h3>
                Conversations
                <span class="counter">
                  ${calls.length}
                </span>
              </h3>
            </div>

            <span class="muted">
              ${count(calls, "DUPLICATE")} duplicates
              · ${failures} errors
            </span>
          </div>

          <div class="filters">
            <input
              id="search"
              placeholder="Search agent or interaction ID"
              value="${esc(search)}">

            <select id="filter">
              <option value="">All agents</option>

              ${[
                ...new Set(
                  calls.map(c => c.agent)
                )
              ].map(agent => `
                <option
                  value="${esc(agent)}"
                  ${agent === agentFilter
                    ? "selected" : ""}>
                  ${esc(agent)}
                </option>
              `).join("")}
            </select>
          </div>

          <div class="table-scroll queue">
            <table>
              <thead>
                <tr>
                  <th>AGENT / INTERACTION</th>
                  <th>DURATION</th>
                  <th>QA</th>
                  <th>STATUS</th>
                </tr>
              </thead>

              <tbody>
                ${calls.map(c => `
                  <tr
                    class="call-row ${
                      c.key === selected
                        ? "selected" : ""
                    }"
                    data-call="${esc(c.key)}"
                    data-search="${esc(
                      (
                        c.agent + " " + c.id
                      ).toLowerCase()
                    )}"
                    data-agentname="${esc(c.agent)}">

                    <td>
                      <b>${esc(c.agent)}</b>
                      <small>
                        ${esc(c.id || c.key)}
                      </small>
                    </td>

                    <td>
                      ${esc(c.duration || "—")}
                    </td>

                    <td>
                      <b>${fmt(c.score?.score)}</b>
                      <small>
                        Cov. ${fmt(c.score?.coverage)}
                      </small>
                    </td>

                    <td>
                      ${chip(c.status)}
                    </td>
                  </tr>
                `).join("") || `
                  <tr>
                    <td colspan="4" class="empty">
                      Upload a transcript file to
                      populate this queue.
                    </td>
                  </tr>
                `}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <div>
        ${aiPanel(phase, message)}

        <section class="panel">
          <div class="panel-heading">
            <div>
              <span class="kicker">
                LIVE BATCH PROGRESS
              </span>

              <h3>Processing status</h3>
            </div>

            <strong>${pct}%</strong>
          </div>

          <div class="progress">
            <div style="width:${pct}%"></div>
          </div>

          <div class="progress-numbers">
            <div>
              <b>${done}</b>
              <span>Completed</span>
            </div>

            <div>
              <b>${ready}</b>
              <span>Pending</span>
            </div>

            <div>
              <b>${failures}</b>
              <span>Failed</span>
            </div>
          </div>

          <div class="footnote">
            Progress advances on actual
            completed or excluded calls,
            never from a visual timer.
          </div>
        </section>

        <section class="panel hint">
          <span class="kicker">QA SCORING</span>

          <h3>
            Evidence first.
            Percentages second.
          </h3>

          <p>
            Gemini checks rubric behaviours.
            Qualis calculates criterion scores
            using fixed checkpoint rules.
            Missing evidence stays unscored.
          </p>
        </section>
      </div>
    </div>

    <section class="panel" id="call-detail">
      ${callDetail(
        calls.find(c => c.key === selected),
        state.rubric
      )}
    </section>
  `;
}

/**
 * QA-UI-CALL-DETAIL
 * Transcript and evidence-linked parameter assessments.
 */
export function callDetail(call, rubric) {
  if (!call) {
    return `
      <div class="empty">
        Select an interaction to view its transcript
        and parameter-level QA evidence.
      </div>
    `;
  }

  const names = new Map(
    (
      call.meta?.criteria ||
      rubric.criteria
    ).map(c => [
      c.id,
      c
    ])
  );

  const results = call.findings || [];

  return `
    <div class="panel-heading">
      <div>
        <span class="kicker">
          03 / CALL EVIDENCE
        </span>

        <h3>
          ${esc(call.agent)} ·
          ${esc(call.id || call.key)}
        </h3>

        <p class="muted">
          ${esc(
            call.duration || "Duration unavailable"
          )}
          · ${esc(call.type || "Call")}
          ·
          ${call.meta
            ? `Rubric revision ${
                call.meta.rubricRevision
              } · ${esc(call.meta.model)}`
            : "Not yet evaluated"}
        </p>
      </div>

      <div class="score-group">
        <div>
          <small>QA SCORE</small>
          <b>${fmt(call.score?.score)}</b>
        </div>

        <div>
          <small>COVERAGE</small>
          <b>${fmt(call.score?.coverage)}</b>
        </div>

        ${chip(call.status)}
      </div>
    </div>

    ${renderScoreExplanation(call)}
    ${(() => { const x = coverageBreakdown(call, { criteria: call.meta?.criteria?.map(c => ({ ...c, mode: rubric.criteria.find(r => r.id === c.id)?.mode, enabled: true })) || rubric.criteria }); if (!x) return ""; return `<details class="qa-call-explainer" open><summary><strong>Why was coverage limited?</strong><span>Evidence gaps and requirements</span></summary>${x.groups.map(g=>`<div class="qa-coverage-reason"><b>${esc(g.title)} — ${g.percentOfApplicable}% of applicable rubric weight</b>${g.criteria.map(c=>`<p><strong>${esc(criterionLabel(c,rubric))}</strong>: ${esc(c.reason)}</p>`).join("")}</div>`).join("") || "<p>No unverified criteria in this rubric.</p>"}<p class="muted">${x.notApplicable} criteria marked Not Applicable and excluded.</p></details>`; })()}

    ${call.error ? `
      <div class="error-note">
        ${esc(call.error)}.
        Partial findings do not count as a
        completed AI assessment.
      </div>
    ` : ""}

    <div class="evidence-grid">
      <div>
        <div class="minor-title">
          Transcript
          <small>
            ${call.turns.length} turns
          </small>
        </div>

        <div class="scroller">
          ${call.turns.map(t => `
            <article class="turn ${esc(t.speaker)}">
              <div>
                <b>
                  ${
                    t.speaker === "agent"
                      ? "AGENT"
                      : t.speaker === "customer"
                        ? "CUSTOMER"
                        : "UNMAPPED"
                  }
                </b>

                <small>
                  ${esc(t.timestamp || "—")}
                  · #${t.line}
                </small>
              </div>

              <p dir="auto">
                ${esc(t.text)}
              </p>
            </article>
          `).join("") || `
            <div class="empty">
              No transcript.
            </div>
          `}
        </div>
      </div>

      <div>
        <div class="minor-title">
          QA rubric
          <small>
            ${results.length} criteria
          </small>
        </div>

        <div class="scroller">
          ${results.map(f => {
            const definition = names.get(f.id);

            return `
              <article class="finding">
                <div class="finding-top">
                  <div>
                    <small>
                      ${esc(
                        definition?.group || "QA"
                      )}
                    </small>

                    <b>
                      ${esc(
                        definition?.name || f.id
                      )}
                    </b>
                  </div>

                  <strong class="result ${
                    f.status === "SCORED"
                      ? "scored" : ""
                  }">
                    ${
                      f.score === null
                        ? esc(
                            f.status.replaceAll(
                              "_", " "
                            )
                          )
                        : fmt(f.score)
                    }
                  </strong>
                </div>

                <p>
                  ${esc(f.reason || "")}
                </p>

                ${(f.anchors || []).map(a => `
                  <div class="anchor">
                    <div>
                      <span class="anchor-state state-${
                        esc(a.state.toLowerCase())
                      }">
                        ${esc(a.state)}
                      </span>

                      ${esc(a.text)}
                    </div>

                    ${(a.evidence || []).map(e => `
                      <blockquote dir="auto">
                        <b>Line ${Number(e.line)}</b>
                        ${esc(e.quote)}
                      </blockquote>
                    `).join("")}
                  </div>
                `).join("")}
              </article>
            `;
          }).join("") || `
            <div class="empty">
              Evaluate this call to generate
              evidence-linked findings.
            </div>
          `}
        </div>
      </div>
    </div>
  `;
}

/**
 * QA-UI-AGENTS
 * Agent-level scorecard and interaction drilldown.
 */
export function agentsView(state) {
  const { calls, agentFilter } = state;

  return `
    <section class="panel">
      <div class="panel-heading">
        <div>
          <span class="kicker">
            PERFORMANCE INTELLIGENCE
          </span>

          <h3>Agent QA overview</h3>
        </div>

        <button class="secondary"
          data-page-go="studio">
          + Evaluate interactions
        </button>
      </div>

      ${tableAgents(calls)}
    </section>

    ${agentFilter ? `
      <section class="panel">
        <div class="panel-heading">
          <div>
            <span class="kicker">
              AGENT DRILLDOWN
            </span>

            <h3>
              ${esc(agentFilter)} · Interactions
            </h3>
          </div>

          <button class="link"
            id="clearAgent">
            Clear filter ×
          </button>
        </div>

        <div class="table-scroll">
          <table>
            <thead>
              <tr>
                <th>INTERACTION</th>
                <th>DURATION</th>
                <th>QA</th>
                <th>COVERAGE</th>
                <th>STATUS</th>
                <th></th>
              </tr>
            </thead>

            <tbody>
              ${calls
                .filter(c =>
                  c.agent === agentFilter
                )
                .map(c => `
                  <tr>
                    <td>
                      ${esc(c.id || c.key)}
                    </td>

                    <td>
                      ${esc(c.duration || "—")}
                    </td>

                    <td>
                      ${fmt(c.score?.score)}
                    </td>

                    <td>
                      ${fmt(c.score?.coverage)}
                    </td>

                    <td>
                      ${chip(c.status)}
                    </td>

                    <td>
                      <button class="link"
                        data-open="${esc(c.key)}">
                        Review →
                      </button>
                    </td>
                  </tr>
                `).join("")}
            </tbody>
          </table>
        </div>
      </section>
    ` : `
      <div class="notice">
        Select an agent using Inspect to review
        every imported call separately.
      </div>
    `}
  `;
}

/**
 * QA-UI-CONFIG
 * Editable 7-category, 27-parameter QA rubric.
 */

/** Inline editor for the selected rubric criterion; preserves existing save IDs. */
function criterionLabel(c,rubric) {
  const id = c.id === "greet7" ? "greeting_time" : c.id === "greet10" ? "fallback_greeting" : null;
  if (!id) return c.name;
  const threshold = rubric.rules.deterministic?.find(r=>r.id===id)?.value;
  return Number.isFinite(threshold) ? "Greeting within " + threshold + " seconds" + (c.id==="greet10"?" (fallback)":"") : c.name;
}
function renderCriterionEditor(c, rubric) {
  const ids = linkedRules(c.id);
  const rulesMarkup = ids.length ? `
    <div class="qa-criterion-rules"><h4>Evaluation rules</h4>
    <p class="muted">Enable the checks to apply under this criterion. Thresholds and selections are saved with the rubric.</p>
    ${ids.map(id => {
      const def = DETERMINISTIC_RULES.find(r => r.id === id);
      if (!def) return "";
      const value = rubric.rules.deterministic?.find(r => r.id === id) || def;
      return `<div class="qa-rule-item">
        <label class="qa-rule-toggle"><input type="checkbox" data-rule-enabled="${esc(id)}" ${value.enabled ? "checked" : ""}><strong>${esc(def.name)}</strong></label>
        <div class="qa-rule-number"><input type="number" min="0" step="any" data-rule-value="${esc(id)}" value="${esc(value.value)}" aria-label="${esc(def.name)} threshold"><span>${esc(def.unit)}</span></div>
        <small>${esc(def.description)} · ${def.connected ? "Transcript evaluator available" : "Requires additional evidence or evaluation support"}</small>
      </div>`;
    }).join("")}
    </div>` : "";
  if (c.mode === "timing") {
    return `
      <div class="qa-inline-editor">
        <div class="qa-inline-heading">
          <strong>${esc(c.name)}</strong>
          <span class="tag">Linked deterministic rule</span>
        </div>
        <p class="muted">Configure the linked timing rule below. Its threshold is used by the evaluator when the criterion is enabled.</p>
        <label>Scoring weight</label>
        <input id="cWeight" type="number" min="0" max="100" value="${c.weight}">
        <input type="hidden" id="cName" value="${esc(c.name)}">
        <textarea id="cDefinition" hidden>${esc(c.definition)}</textarea>
        <textarea id="cInstruction" hidden>${esc(c.instructions)}</textarea>
        ${rulesMarkup}<button class="primary" id="saveCriterion">Save criterion and rules</button>
        <span class="save-status" id="saved"></span>
      </div>`;
  }
  return `
        <div class="qa-inline-editor">
          <div class="panel-heading">
            <div>
              <span class="kicker">
                EDIT SELECTED PARAMETER
              </span>

              <h3>${esc(c.name)}</h3>
            </div>

            <span class="tag">
              ${esc(MODES[c.mode])}
            </span>
          </div>

          <label>Main criteria</label>
          <input disabled
            value="${esc(c.group)}">

          <label>Parameter name</label>
          <input id="cName"
            value="${esc(c.name)}">

          <label>Definition</label>
          <textarea id="cDefinition">${
            esc(c.definition)
          }</textarea>

          <label>QA evaluator instruction</label>
          <textarea id="cInstruction">${
            esc(c.instructions)
          }</textarea>

          <div class="form-grid">
            <div>
              <label>Scoring weight</label>
              <input id="cWeight"
                type="number"
                min="0"
                max="100"
                value="${c.weight}">
            </div>

            <div>
              <label>Evidence method</label>
              <input disabled
                value="${esc(MODES[c.mode])}">
            </div>
          </div>

          ${c.mode === "ai" ? `
            <label>
              Observable scoring checkpoints
              · one per line
            </label>

            <textarea id="cAnchors"
              rows="6">${
                esc(
                  c.checkpoints.map(a =>
                    a.text
                  ).join("\n")
                )
              }</textarea>

            <p class="footnote">
              The model returns MET, MISSED,
              UNKNOWN or NA per checkpoint.
              Qualis, not Gemini, calculates
              the percentage. A parameter is
              scored only when every applicable
              checkpoint is supported.
            </p>
          ` : `
            <p class="footnote">
              This parameter requires ${
                c.mode === "timing"
                  ? "reliable timestamp and greeting evidence"
                  : c.mode === "audio"
                    ? "audio or approved event records"
                    : "verified external evidence"
              }.
              Editing a description cannot
              create missing evidence.
            </p>
          `}

          ${rulesMarkup}
          <button class="primary"
            id="saveCriterion">
            Save parameter
          </button>

          <span class="save-status"
            id="saved"></span>
        </div>
  `;
}

export function configuration(rubric, selected) {
  const c =
    rubric.criteria.find(x =>
      x.id === selected
    ) || rubric.criteria[0];

  return `
    <div class="configuration">
      <section class="panel index">
        <div class="panel-heading">
          <div>
            <span class="kicker">
              QA GOVERNANCE
            </span>

            <h3>SHARE 27-parameter rubric</h3>
          </div>

          <span class="tag">
            REV. ${rubric.revision}
          </span>
        </div>

        <p class="muted">
          All criteria are editable.
          Settings apply to subsequent evaluations
          without modifying JavaScript.
        </p>

        ${GROUPS.map(group => `
          <div class="group">
            <h4>
              ${esc(group)}

              <span>
                ${
                  rubric.criteria.filter(
                    x => x.group === group
                  ).length
                }
              </span>
            </h4>

            ${rubric.criteria
              .filter(x =>
                x.group === group
              )
              .map(x => `
                <div class="rubric-row ${
                  x.id === c.id ? "on" : ""
                }">
                  <input
                    type="checkbox"
                    data-enabled="${esc(x.id)}"
                    ${x.enabled ? "checked" : ""}
                    aria-label="Enable ${esc(x.name)}">

                  <button
                    data-criterion="${esc(x.id)}">
                    ${esc(x.name)}
                  </button>
                </div>
                ${x.id === c.id ? renderCriterionEditor(c, rubric) : ""}
              `).join("")}
          </div>
        `).join("")}
      </section>

      <div>
        <section class="panel">
          <div class="panel-heading">
            <div>
              <span class="kicker">
                LLM ADAPTER
              </span>

              <h3>Evaluator configuration</h3>
            </div>

            <span class="tag">
              CLOUDFLARE SECRET
            </span>
          </div>

          <label>Active Gemini model</label>

          <select id="model">
            <option
              value="gemini-3.5-flash-lite"
              ${rubric.model ===
                "gemini-3.5-flash-lite"
                  ? "selected" : ""}>
              Gemini 3.5 Flash-Lite (default)
            </option>

            <option
              value="gemini-2.5-flash-lite"
              ${rubric.model ===
                "gemini-2.5-flash-lite"
                  ? "selected" : ""}>
              Gemini 2.5 Flash-Lite
              (legacy access)
            </option>
          </select>

          <label>
            Global evaluator instructions
          </label>

          <textarea id="global">${
            esc(rubric.instructions)
          }</textarea>

          <p class="footnote">
            Model changes can affect evidence
            interpretation but never the scoring
            formula. Compare models against
            human-reviewed QA samples before
            using scores for formal decisions.
          </p>

          <button class="secondary"
            id="saveModel">
            Save AI configuration
          </button>
        </section>
      </div>
    </div>
  `;
}
