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
          QAMAFer.AI / QUALITY INTELLIGENCE
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
  const active = ["rules", "ai", "validating", "loading"].includes(phase);
  const failure = phase === "error";
  const subtitle = active
    ? "Tracing evidence and evaluating against your QA rubric"
    : failure ? "Review the processing error and retry"
    : "Your quality intelligence engine is ready";
  return `
    <section class="ai-panel qmf-evaluator ${active ? "active qmf-processing" : "qmf-ready"} ${failure ? "error" : ""}" aria-label="QAMAFer.AI evaluator">
      <div class="ai-panel-head">
        <span class="qmf-eval-brand"><span class="qmf-eval-star">✦</span> QAMAFer.AI EVALUATOR</span>
        <span class="qmf-engine-pill"><span class="qmf-live-dot"></span>${active ? "PROCESSING" : failure ? "ATTENTION REQUIRED" : "READY"}</span>
      </div>
      <div class="qmf-eval-visual" aria-hidden="true">
        <div class="qmf-energy-waves qmf-wave-one"></div>
        <div class="qmf-energy-waves qmf-wave-two"></div>
        <div class="qmf-orbit qmf-orbit-outer"><i></i><i></i><i></i></div>
        <div class="qmf-orbit qmf-orbit-mid"></div>
        <div class="qmf-orbit qmf-orbit-inner"></div>
        <div class="qmf-core-shell">
          <div class="qmf-core"><span>AI</span></div>
        </div>
        <span class="qmf-spark qmf-spark-a">✧</span>
        <span class="qmf-spark qmf-spark-b">✦</span>
        <span class="qmf-spark qmf-spark-c">✧</span>
      </div>
      <div class="qmf-eval-copy">
        <h3>${active ? "Analysing your interaction…" : failure ? "Evaluation needs attention" : "Ready to process"}</h3>
        <p>${subtitle}</p>
        <p id="ai-stage" class="qmf-stage">${esc(message)}</p>
      </div>
      <div class="qmf-eval-footer">
        <span>✧ Understands context</span><span>◈ Validates evidence</span><span>▥ Scores consistently</span>
      </div>
    </section>
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
    <div class="studio-intro"><div><span class="kicker">AI EVALUATION STUDIO</span><h2>Evaluate interactions with AI</h2><p>Import conversations and turn them into evidence-linked quality intelligence.</p></div><div class="studio-trust studio-trust-head"><span class="studio-trust-icon">✓</span><span>Evidence validated · Accurate · Scalable</span></div></div>
    <div class="studio studio-v3 studio-v4">
      <div class="studio-intake-column">
        <section class="panel studio-intake-panel">
          <div class="panel-heading">
            <div>
              <span class="kicker">
                INTERACTION INTAKE
              </span>

              <h3>Choose your interaction source</h3>
            </div>

            <span class="tag">AUTO-IMPORT ENABLED</span>
          </div>

          <div class="studio-intake-grid">
            <div class="intake-tile intake-paste">
              <div class="intake-tile-heading"><span class="intake-option-icon" aria-hidden="true">▤</span><strong>Paste transcript</strong></div>
              <details class="paste-expander" open>
                <summary>Paste a speaker-labelled transcript · expand / collapse</summary>
                <textarea id="paste" rows="5" placeholder="Paste a Genesys transcript with speaker labels and timestamps…">${esc(state.pasteDraft || "")}</textarea>
              </details>
              <small>Automatically imports valid pasted transcripts</small>
              <p id="import-feedback" class="muted" role="status" aria-live="polite">${esc(state.importFeedback || "")}</p>
            </div>
            <div class="intake-tile intake-file">
              <div class="intake-tile-heading"><span class="intake-option-icon" aria-hidden="true">⇧</span><strong>Upload transcript</strong></div>
              <label class="upload" for="file">
                <span>⇧</span><b>Browse transcript file</b>
                <small>TXT · TSV · CSV · JSON · SRT · VTT · MD</small>
              </label>
              <input id="file" type="file" accept=".txt,.tsv,.csv,.json,.srt,.vtt,.md,.log" hidden ${running ? "disabled" : ""}>
            </div>
            <div class="intake-tile intake-audio">
              <div class="intake-tile-heading"><span class="intake-option-icon" aria-hidden="true">♫</span><strong>Audio file</strong></div>
              <div class="upload audio-coming-soon">
                <span>♫</span><b>Audio intake · upcoming</b>
                <small>Not enabled in this prototype. Use a transcript export.</small>
              </div>
            </div>
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
              id="stopAfter"
              ${running ? "" : "disabled"}>
              Finish current & stop
            </button>
            <button class="secondary"
              id="stop"
              ${running ? "" : "disabled"}>
              Stop evaluation
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

      </div>
      <div class="studio-evaluator-row">
        <div class="studio-evaluator-main">
        ${aiPanel(phase, message)}
        </div>
        <div class="studio-evaluator-side">
          <div class="studio-trust"><span class="studio-trust-icon">✓</span><div><strong>Evidence validated · Accurate · Scalable</strong><small>Evidence-led quality intelligence</small></div></div>
          <section class="studio-eval-details panel">
            <div class="kicker">EVALUATION DETAILS</div>
            <dl><div><dt>Rubric</dt><dd>${esc(state.rubric.name || "SHARE QA Rubric")} · Rev ${esc(state.rubric.revision)}</dd></div>
            <div><dt>Interactions</dt><dd>${calls.length}</dd></div>
            <div><dt>Status</dt><dd>${running?"In progress":done?"Last cycle complete":"Ready"}</dd></div></dl>
          </section>
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

          <div class="qa-timing-status" id="qa-timing-status" aria-live="off">
            <span>Elapsed <strong id="qa-elapsed">00:00</strong></span>
            <span>ETA <strong id="qa-eta">Calculating…</strong></span>
            <span id="qa-batch-count">0 / 0 processed</span>
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

        </div>
      </div>
      <div class="studio-queue-row">
        <section class="panel">
          <div class="panel-heading">
            <div>
              <span class="kicker">
                EVALUATION QUEUE
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
      <div class="studio-hint-row">
        <section class="panel hint">
          <span class="kicker">QA SCORING</span>

          <h3>
            Evidence first.
            Percentages second.
          </h3>

          <p>
            The model checks rubric behaviours.
            QAMAFer.AI calculates criterion scores
            using fixed checkpoint rules.
            Missing evidence stays unscored.
          </p>
        </section>
      </div>
    </div>

    <section class="panel studio-results" id="call-detail">
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

                      <span class="qa-method-tag ${a.method==="quantitative"?"qa-method-rule":"qa-method-ai"}">${a.method==="quantitative"?"Quantitative · Rule":"Qualitative · Model"}</span> ${esc(a.text)}
                    </div>

                    ${a.validation?.status==="UNVERIFIED" ? `
                      <p class="qa-validation-warning"><strong>Evidence unverified</strong> · Original: ${esc(a.validation.originalState)} · Final: UNKNOWN. ${esc(a.validation.reason)}</p>
                    ` : a.validation?.status==="VERIFIED" ? `
                      <span class="qa-validation-ok">Evidence verified</span>
                    ` : ""}
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
  const ids=linkedRules(c.id);
  const rules=ids.map(id=>{
    const def=DETERMINISTIC_RULES.find(r=>r.id===id);
    if(!def)return "";
    const setting=rubric.rules.deterministic?.find(r=>r.id===id)||def;
    const points=c.ruleWeights?.[id]??1;
    return `<div class="qa-check-row">
      <label class="qa-check-name"><input type="checkbox" data-rule-enabled="${esc(id)}" ${setting.enabled?"checked":""}><span>${esc(def.name)}</span></label>
      <label class="qa-check-value"><small>Threshold (${esc(def.unit)})</small><input type="number" min="0" step="any" data-rule-value="${esc(id)}" value="${esc(setting.value)}"></label>
      <label class="qa-check-points"><small>Points</small><input type="number" min="0" max="100" step="0.5" data-rule-points="${esc(id)}" value="${esc(points)}"></label>
      <small class="qa-check-help">${esc(def.description)} · ${esc(def.source)} evidence</small>
    </div>`;
  }).join("");
  const qualitative=c.checkpoints.map((a,i)=>`
    <div class="qa-check-row">
      <label class="qa-check-name"><input type="checkbox" data-anchor-enabled="${i}" ${a.enabled!==false?"checked":""}><span>Qualitative check ${i+1}</span></label>
      <label class="qa-check-text"><small>Gemini evaluation instruction</small><textarea rows="2" data-anchor-text="${i}">${esc(a.text)}</textarea></label>
      <label class="qa-check-points"><small>Points</small><input type="number" min="0" max="100" step="0.5" data-anchor-points="${i}" value="${esc(a.points??1)}"></label>
    </div>`).join("");
  const noChecks=!ids.length&&!c.checkpoints.length;
  return `<div class="qa-inline-editor">
    <div class="qa-inline-heading"><strong>${esc(criterionLabel(c,rubric))}</strong><span class="tag">${esc(MODES[c.mode])}</span></div>
    <div class="qa-parent-settings">
      <label>Rubric parameter name<input id="cName" value="${esc(c.name)}"></label>
      <label>Parent weight<input id="cWeight" type="number" min="0" max="100" step="0.5" value="${esc(c.weight)}"></label>
    </div>
    <label>Definition<textarea id="cDefinition" rows="2">${esc(c.definition)}</textarea></label>
    <label>Evaluator guidance<textarea id="cInstruction" rows="2">${esc(c.instructions)}</textarea></label>
    <div class="qa-check-heading"><strong>Evaluation checks</strong><small>Enable each check, set its threshold or instruction, and assign its points. Checks requiring audio, CRM, or Genesys evidence cannot be verified from transcript alone.</small></div>
    ${rules}${qualitative}
    ${noChecks?`<p class="qa-check-help">This criterion currently requires ${esc(MODES[c.mode])}. No configured child checks are available; missing evidence will be reported as unverifiable.</p>`:""}

  </div>`;
}

export function configuration(rubric, selected) {
  const c =
    rubric.criteria.find(x =>
      x.id === selected
    ) || rubric.criteria[0];

  return `
    <div class="configuration">
      <div class="qa-floating-save"><span>Rubric changes</span><button type="button" class="primary" id="saveRubricAll">Save all changes</button></div>
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
          Select a parameter to expand its evaluation checks. Configure each check and its points, then save. Settings persist in this browser.
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
              .map(x => {
                const activeChildren = (x.checkpoints || []).filter(a=>a.enabled===true).length;
                const activeRules = linkedRules(x.id).filter(id=>
                  rubric.rules.deterministic?.some(r=>r.id===id&&r.enabled)).length;
                const childActive = activeChildren + activeRules;
                return `
                <div class="rubric-row ${x.id === c.id ? "on" : ""} ${!x.enabled && childActive ? "qa-child-active-parent" : ""}">
                  <input
                    type="checkbox"
                    data-enabled="${esc(x.id)}"
                    ${x.enabled ? "checked" : ""}
                    aria-label="Enable ${esc(x.name)}">

                  <button
                    data-criterion="${esc(x.id)}" aria-expanded="${x.id === c.id}">
                    ${esc(criterionLabel(x,rubric))} ${!x.enabled && childActive ? `<span class="qa-child-active-badge" title="Parent unchecked; selected child checks still run">${childActive} active ${childActive===1?"child":"children"}</span>` : ""} <span class="qa-expand-indicator">${x.id === c.id ? "−" : "+"}</span>
                  </button>
                </div>
                ${x.id === c.id ? renderCriterionEditor(c, rubric) : ""}
              `; }).join("")}
          </div>
        `).join("")}
      </section>

      <div class="qa-evaluator-section">
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


        </section>
      </div>
    </div>
  `;
}
