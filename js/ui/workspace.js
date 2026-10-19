
/**
 * @component QA-UI-001
 * @purpose Interaction workspace, AI animation, findings and settings.
 * @dependsOn core/evaluation.js, config/scorecard.js
 * @usedBy app.js
 * @changeImpact User-visible assessment and configuration screens.
 * @version 1.0
 */

import { calculateScore } from "../core/evaluation.js";

export const SAMPLE = `[00:04] Agent: Good afternoon, welcome to SHARE. My name is Layla. How may I assist you?
[00:09] Customer: Hello. My name is Sara. My SHARE points haven't been credited.
[00:14] Agent: I'm sorry about that, Sara. I can help investigate.
[00:20] Customer: I purchased something yesterday.
[00:25] Agent: Can you share your SHARE ID please?
[00:30] Customer: It's 12345678.
[00:36] Agent: Can you give me your SHARE ID?
[00:40] Customer: I just gave it to you. It's 12345678.
[00:47] Agent: Thank you, Sara. I'll raise a request for investigation.
[00:55] Agent: Is there anything else I can help you with?
[01:01] Customer: No, thank you.
[01:04] Agent: You may receive a short feedback survey. Thank you for your loyalty to SHARE. Have a wonderful day.`;

export function escapeHTML(value) {
  return String(value??"").replace(/[&<>"']/g,
    c=>({"&":"&amp;","<":"&lt;",">":"&gt;",
      '"':"&quot;","'":"&#39;"}[c]));
}

export function renderWorkspace() {
  return `
  <div class="layout">
    <section>
      <div class="card">
        <div class="card-header">
          <h2>New Interaction Assessment</h2>
          <small>Voice · Transcript evaluation</small>
        </div>

        <div class="two-col">
          <div>
            <label>Agent Name</label>
            <input id="agentName" value="Layla">
          </div>
          <div>
            <label>Customer Preferred Name</label>
            <input id="customerName" value="Sara">
          </div>
        </div>

        <label>Interaction Transcript</label>
        <div class="upload-zone">
          <strong>Upload transcript</strong>
          <p class="muted" style="font-size:12px">
            TXT, CSV or JSON with speaker-labelled dialogue.
          </p>
          <input type="file" id="fileInput"
                 accept=".txt,.csv,.json">
        </div>

        <label>Or paste transcript</label>
        <textarea id="transcriptText"
          placeholder="[00:04] Agent: Welcome to SHARE..."></textarea>

        <label style="display:flex;gap:9px;align-items:center">
          <input id="callRelative" type="checkbox">
          Timestamps are relative to call connection
        </label>

        <div class="actions">
          <button class="btn btn-secondary" id="sampleBtn">
            Load Sample
          </button>
          <button class="btn" id="evaluateBtn">
            ✦ Run AI Evaluation
          </button>
        </div>
      </div>

      <div class="card">
        <h2>Interaction Transcript</h2>
        <div class="transcript-view" id="transcriptView">
          <p class="muted">Upload a transcript to view the conversation.</p>
        </div>
      </div>
    </section>

    <section>
      <div class="agent-panel" id="agentPanel" data-state="idle">
        <div class="orb-container">
          <div class="orb-ring"></div>
          <div class="orb-ring second"></div>
          <div class="orb-core">✦</div>
        </div>
        <div class="agent-title">Qualis AI Agent</div>
        <div class="agent-status" id="agentStatus">
          Ready to evaluate
        </div>
        <div class="agent-stage" id="agentStage">
          Awaiting interaction
        </div>
      </div>

      <div class="card">
        <h2>Live QA Assessment</h2>
        <div class="metric-row">
          <div class="metric">
            <strong id="liveScore">—</strong>
            <small>Verified Score</small>
          </div>
          <div class="metric">
            <strong id="passCount" class="pass-text">0</strong>
            <small>Passed</small>
          </div>
          <div class="metric">
            <strong id="failCount" class="fail-text">0</strong>
            <small>Failed</small>
          </div>
        </div>
        <p id="coverage" class="muted" style="font-size:12px">
          Waiting for assessment.
        </p>
      </div>
    </section>
  </div>

  <section class="card">
    <div class="card-header">
      <h2>Evaluation Findings</h2>
      <small id="resultSource">Not evaluated</small>
    </div>
    <div id="results">
      <p class="muted">Your QA findings will appear here.</p>
    </div>
  </section>`;
}

export function setAgentState(state,message,stage="") {
  const panel=document.getElementById("agentPanel");
  if (!panel) return;
  panel.dataset.state=state;
  document.getElementById("agentStatus").textContent=message;
  document.getElementById("agentStage").textContent=stage;
}

export function showTranscript(turns) {
  document.getElementById("transcriptView").innerHTML =
    turns.map(t=>`
      <div class="turn">
        <span class="turn-number">
          Turn ${t.line}${t.seconds===null?"":` · ${t.seconds}s`}
        </span>
        <div><strong>${escapeHTML(t.speaker)}</strong></div>
        <div>${escapeHTML(t.text)}</div>
      </div>
    `).join("") || "<p>No valid dialogue found.</p>";
}

/**
 * @component QA-UI-RESULT-001
 * @purpose Render verifiable evidence and progressive QA score.
 * @dependsOn calculateScore
 * @changeImpact Assessment display only.
 */
export function showResults(findings,config,source) {
  const score=calculateScore(findings,config.criteria);
  const passed=findings.filter(f=>f.status==="PASS").length;
  const failed=findings.filter(f=>f.status==="FAIL").length;

  document.getElementById("liveScore").textContent =
    score.percent===null?"—":score.percent+"%";
  document.getElementById("passCount").textContent=passed;
  document.getElementById("failCount").textContent=failed;

  document.getElementById("coverage").textContent =
    `${score.assessed}/${score.total} checks evaluated · `+
    `${score.coverage}% coverage`;

  document.getElementById("resultSource").textContent=source;

  const byId=new Map(config.criteria.map(c=>[c.id,c]));

  document.getElementById("results").innerHTML =
    `<div class="notice">
      This score covers verifiable checks only. It is not a full
      QA certification where evidence is missing.
    </div>`+
    findings.map(f=>{
      const criterion=byId.get(f.id);
      if (!criterion) return "";
      const allowed=["PASS","FAIL","NOT_VERIFIABLE","NOT_APPLICABLE"];
      const status=allowed.includes(f.status)
        ? f.status:"NOT_VERIFIABLE";
      const evidence=(f.evidence||[]).map(e=>`
        <div class="evidence">
          <strong>Turn ${Number(e.line)||"?"}</strong><br>
          ${escapeHTML(e.quote)}
        </div>`).join("");

      return `
        <div class="finding">
          <div class="finding-head">
            <div>
              <small>${escapeHTML(criterion.category)}</small>
              <h3>${escapeHTML(criterion.name)}</h3>
            </div>
            <span class="badge badge-${status}">
              ${status.replaceAll("_"," ")}
            </span>
          </div>
          <p class="muted" style="font-size:12px">
            ${escapeHTML(f.reason)}
          </p>
          ${evidence}
          ${f.coaching?`
            <p style="font-size:12px">
              <strong>Coaching:</strong> ${escapeHTML(f.coaching)}
            </p>`:""}
        </div>`;
    }).join("");
}

export function renderSettings(config) {
  return `
    <div class="layout">
      <div>
        <section class="card">
          <h2>QA Scorecard Manager</h2>
          <p class="muted">Configure criteria and weights.
          Changes apply to subsequent evaluations.</p>
          <div class="settings-row" style="font-weight:700">
            <span>Criterion</span><span>Weight</span><span>Enabled</span>
          </div>
          ${config.criteria.map(c=>`
            <div class="settings-row">
              <span>${escapeHTML(c.name)}
                <small style="display:block">
                  ${escapeHTML(c.category)}
                </small>
              </span>
              <input type="number" min="0" max="100"
                data-weight="${c.id}" value="${c.weight}">
              <input type="checkbox" data-enabled="${c.id}"
                ${c.enabled?"checked":""}>
            </div>`).join("")}
        </section>
      </div>

      <div>
        <section class="card">
          <h2>Rules Engine Settings</h2>
          <label>Greeting threshold (seconds)</label>
          <input id="greetingSeconds" type="number"
                 min="0" max="300"
                 value="${config.rules.greetingSeconds}">
          <label>Customer name occurrences</label>
          <input id="customerNameCount" type="number"
                 min="1" max="20"
                 value="${config.rules.customerNameCount}">
          <label>Branded introduction phrases (one per line)</label>
          <textarea id="brandPhrases">${escapeHTML(
            config.rules.brandPhrases.join("\n"))}</textarea>
          <small>Additional phrase rules remain in configuration.</small>
        </section>

        <section class="card">
          <h2>AI Evaluator Studio</h2>
          <label>AI evaluator instructions</label>
          <textarea id="evaluatorInstructions"
            style="min-height:220px">${escapeHTML(
              config.evaluatorInstructions)}</textarea>
          <label>LLM Model</label>
          <input id="modelName" value="${escapeHTML(config.model)}">
          <small>
            The model must exist and be accessible using your Gemini API key.
          </small>
        </section>

        <button class="btn" id="saveSettings">
          Save Configuration
        </button>
        <p class="muted" id="settingsMessage"></p>
      </div>
    </div>`;
}
