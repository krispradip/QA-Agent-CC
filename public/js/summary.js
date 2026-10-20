/**
 * QA-SUMMARY-001 - Dashboard scorecards and score explanations.
 * Presentation only. Reads existing completed interaction scores.
 * No impact on rubric calculation, Gemini, or historical results.
 */

import { agents } from "./engine.js";

const esc = value => String(value ?? "").replace(/[&<>"']/g, ch => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
})[ch]);

const pct = value => Number.isFinite(value) ? Math.round(value) + "%" : "—";
const average = values => values.length
  ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)
  : null;

function scopeStats(calls) {
  const included = calls.filter(c => c.status !== "DUPLICATE");
  const completed = included.filter(c => c.status === "COMPLETE");
  const rated = completed.filter(c => Number.isFinite(c.score?.score));
  const flags = completed.flatMap(c => c.findings || [])
    .filter(f => f.status === "SCORED" && Number.isFinite(f.score) && f.score <= 50);
  return {
    imported: included.length,
    completed: completed.length,
    score: average(rated.map(c => c.score.score)),
    coverage: average(completed.map(c => Number.isFinite(c.score?.coverage) ? c.score.coverage : 0)),
    flags: flags.length,
    scoredCalls: rated.length
  };
}

const metric = (title, value, note, description) =>
  '<article class="metric qa-metric" title="' + esc(description) + '">' +
    '<span>' + esc(title) + '</span>' +
    '<strong>' + esc(value) + '</strong>' +
    '<small>' + esc(note) + '</small>' +
  '</article>';

/**
 * QA-SUMMARY-DASHBOARD-001
 * Mean scores are simple per-completed-call averages; not
 * model certainty, full-rubric compliance, or staff ranking.
 */
export function renderDashboardSummary(calls, selectedAgent = "") {
  const agentRows = agents(calls);
  const names = agentRows.map(a => a.agent);
  const selected = names.includes(selectedAgent) ? selectedAgent : "";
  const filtered = selected ? calls.filter(c => c.agent === selected) : calls;
  const s = scopeStats(filtered);
  const label = selected ? selected : "All agents";

  const cards = (selected ? agentRows.filter(a => a.agent === selected) : agentRows)
    .map(a =>
      '<button type="button" class="qa-agent-card' + (a.agent === selected ? ' is-selected' : '') +
      '" data-dashboard-agent="' + esc(a.agent) + '" title="Filter dashboard to this agent">' +
        '<span class="qa-agent-card-head">' +
          '<b>' + esc(a.agent) + '</b><span>View agent →</span>' +
        '</span>' +
        '<span class="qa-agent-score">' + pct(a.average) + '</span>' +
        '<span class="qa-agent-meta">Average QA of scored calls</span>' +
        '<span class="qa-agent-card-footer">' +
          '<span>Coverage <b>' + pct(a.coverage) + '</b></span>' +
          '<span>Evaluated <b>' + a.completed + ' / ' + a.imported + '</b></span>' +
        '</span>' +
      '</button>'
    ).join("");

  return [
    '<section class="panel qa-dashboard-panel">',
      '<div class="panel-heading qa-dashboard-heading">',
        '<div><span class="kicker">QUALITY SCORECARDS</span>',
        '<h3>Team and agent performance</h3>',
        '<p class="muted">Scope: ' + esc(label) + ' · Completed calls only contribute to scores</p></div>',
        '<label class="qa-filter-label">Show results for',
          '<select id="overview-agent-filter" aria-label="Filter QA results by agent">',
            '<option value="">All agents</option>',
            names.map(a => '<option value="' + esc(a) + '"' +
              (a === selected ? ' selected' : '') + '>' + esc(a) + '</option>').join(""),
          '</select>',
        '</label>',
      '</div>',
      '<div class="metrics qa-summary-metrics">',
        metric("AVERAGE QA SCORE", pct(s.score), s.scoredCalls + " scored calls",
          "Arithmetic mean of completed, scored call QA percentages. Not full-rubric compliance."),
        metric("AVERAGE COVERAGE", pct(s.coverage), "Across " + s.completed + " completed calls",
          "Average proportion of applicable enabled rubric weight backed by scored findings."),
        metric("CALLS EVALUATED", s.completed + " / " + s.imported, "Excludes duplicate exports",
          "Completed evaluations out of imported, non-duplicate interaction records."),
        metric("COACHING FINDINGS", s.flags, "Scored criteria at 50% or below",
          "Count of scored criterion findings at or below 50%; not unique agents or confirmed compliance incidents."),
      '</div>',
      '<div class="qa-score-guide">',
        '<div><strong>QA score</strong> = average of scored call results, not the entire rubric.</div>',
        '<div><strong>Coverage</strong> = how much applicable rubric weight had sufficient evidence.</div>',
        '<div>Always interpret the two together. Unverifiable findings contribute no points and no penalties.</div>',
      '</div>',
      '<div class="qa-agent-grid">', cards || '<div class="empty">Import and evaluate calls to see agent scorecards.</div>', '</div>',
    '</section>'
  ].join("");
}

/**
 * QA-SUMMARY-CALL-001
 * Explains a specific call's score and uncovered rubric weight.
 */
export function renderScoreExplanation(call) {
  const s = call?.score;
  if (!s) {
    return '<div class="qa-call-explainer"><strong>How scoring works:</strong> ' +
      'Qualis scores only rubric criteria supported by available evidence. ' +
      'A QA percentage and coverage appear after evaluation.</div>';
  }

  const score = pct(s.score);
  const coverage = pct(s.coverage);
  const uncovered = Number.isFinite(s.coverage) ? pct(Math.max(0, 100 - s.coverage)) : "—";
  const count = Number.isFinite(s.scored) ? s.scored : 0;
  const total = Number.isFinite(s.total) ? s.total : 0;

  return [
    '<details class="qa-call-explainer" open>',
      '<summary><strong>What do QA Score ', score, ' and Coverage ', coverage, ' mean?</strong>',
        '<span>Click to expand or collapse</span></summary>',
      '<div class="qa-call-explainer-grid">',
        '<div><b>QA score · ', score, '</b><p>Weighted result across only the rubric criteria fully assessed with evidence. This is not a definitive score for the entire call.</p></div>',
        '<div><b>Assessment coverage · ', coverage, '</b><p>Share of applicable enabled rubric weight scored. ', uncovered, ' remains outside this assessment.</p></div>',
      '</div>',
      '<p class="qa-call-explainer-footer">',
        count, ' of ', total, ' weighted criteria scored. ',
        'Unverifiable findings neither pass nor fail. ',
        'Not-applicable criteria are excluded from the coverage denominator.',
      '</p>',
    '</details>'
  ].join("");
}
