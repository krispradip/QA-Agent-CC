
/**
 * QA-ENGINE-001
 * Purpose: Deterministic QA, scoring and per-call execution.
 * Depends on: config/scorecard.js, Cloudflare /api/evaluate.
 * Used by: app.js and ui/views.js.
 * Impact: QA scores and supporting evidence.
 * Version: 2.0
 */

import { AI_IDS } from "../config/scorecard.js";

const result = (c, status, reason, turn) => ({
  id: c.id,
  name: c.name,
  group: c.group,
  status,
  reason,
  evidence: turn
    ? [{ line: turn.line, quote: turn.text }]
    : [],
  coaching: "",
  source: "Rules"
});

/**
 * QA-ENGINE-002
 * Purpose: Execute objective checks on one interaction.
 * Configuration: cfg.rules and cfg.criteria.
 * Safeguard: Unavailable evidence must be NOT_VERIFIABLE.
 */
export function runRules(call, cfg) {
  const agent = call.turns.filter(t => t.speaker === "agent");

  return cfg.criteria
    .filter(c => c.enabled)
    .map(c => {
      const nv = why =>
        result(c, "NOT_VERIFIABLE", why);

      if (AI_IDS.has(c.id)) {
        return nv("Pending Gemini evaluation");
      }

      if (c.type === "external") {
        return nv(
          "Requires approved SOP, CRM or Genesys event data"
        );
      }

      if (c.type === "audio") {
        return nv(
          "Requires audio or independently verified event data"
        );
      }

      if (!agent.length) {
        return nv("No agent speech available");
      }

      if (c.type === "timing") {
        const first = agent[0];

        if (first.seconds === null) {
          return nv("No call-relative timestamp");
        }

        return result(
          c,
          first.seconds <= cfg.rules[c.id]
            ? "PASS" : "FAIL",
          `First agent turn at ${first.seconds}s; limit ${cfg.rules[c.id]}s`,
          first
        );
      }

      if (c.type === "count") {
        return nv(
          "Customer preferred name is not established reliably by this export"
        );
      }

      const phrases = cfg.rules[c.id] || [];

      if (!phrases.length) {
        return nv("No acceptable phrases configured");
      }

      const scope = c.id === "intro"
        ? agent.slice(0, 3)
        : ["closing", "survey", "assistance"].includes(c.id)
          ? agent.slice(-8)
          : agent;

      const turn = scope.find(t =>
        phrases.some(p =>
          p && t.text.toLowerCase().includes(p.toLowerCase())
        )
      );

      return result(
        c,
        turn ? "PASS" : "FAIL",
        turn
          ? "Configured phrase matched"
          : "Configured phrase not detected; transcription accuracy may affect the result",
        turn
      );
    });
}

/**
 * QA-SCORE-001
 * Purpose: Calculate evidence-qualified weighted scores.
 * Impact: Call scores and agent averages.
 * Safeguard: Missing evidence never receives automatic points.
 */
export function score(findings, cfg) {
  const weights = new Map(
    cfg.criteria.map(c => [c.id, c.weight])
  );

  const checked = findings.filter(f =>
    ["PASS", "FAIL"].includes(f.status)
  );

  const total = checked.reduce(
    (n, f) => n + (weights.get(f.id) || 0), 0
  );

  const earned = checked.reduce(
    (n, f) =>
      n + (f.status === "PASS"
        ? (weights.get(f.id) || 0) : 0),
    0
  );

  return {
    value: total
      ? Math.round(earned / total * 100)
      : null,
    coverage: findings.length
      ? Math.round(checked.length / findings.length * 100)
      : 0,
    assessed: checked.length,
    total: findings.length
  };
}

/**
 * QA-ENGINE-003
 * Purpose: Perform actual live Gemini evaluation for one call.
 * Output: Criterion findings with evidence and coaching.
 * Impact: Evaluation results and UI processing states.
 */
export async function evaluateCall(call, cfg, onStage, signal) {
  call.status = "PROCESSING";

  onStage("rules");

  call.findings = runRules(call, cfg);
  call.score = score(call.findings, cfg);

  onStage("ai");

  const ai = cfg.criteria.filter(c =>
    c.enabled && AI_IDS.has(c.id)
  );

  if (ai.length) {
    const res = await fetch("/api/evaluate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      signal,
      body: JSON.stringify({
        model: cfg.model,
        instructions: cfg.instructions,
        criteria: ai,
        turns: call.turns
      })
    });

    const payload = await res.json().catch(() => ({}));

    if (!res.ok) {
      const e = new Error(
        payload.error || `API error ${res.status}`
      );
      e.status = res.status;
      throw e;
    }

    onStage("validating");

    const allowed = new Map(ai.map(c => [c.id, c]));

    const byId = new Map(
      (payload.findings || [])
        .filter(f => allowed.has(f.id))
        .map(f => [f.id, f])
    );

    call.findings = call.findings.map(f =>
      byId.has(f.id)
        ? {
            ...f,
            ...byId.get(f.id),
            name: f.name,
            group: f.group,
            source: "Gemini"
          }
        : f
    );

    call.score = score(call.findings, cfg);
  }

  call.status = "COMPLETE";
  onStage("complete");
}

/**
 * QA-AGG-001
 * Purpose: Aggregate completed interactions by agent.
 * Safeguard: Excludes duplicate interactions and null scores.
 */
export function agentStats(calls) {
  const map = new Map();

  for (const c of calls) {
    if (c.status === "DUPLICATE") continue;

    const a = map.get(c.agent) || {
      name: c.agent,
      calls: 0,
      complete: 0,
      values: [],
      cover: []
    };

    a.calls++;

    if (c.status === "COMPLETE") {
      a.complete++;

      if (c.score?.value !== null) {
        a.values.push(c.score.value);
        a.cover.push(c.score.coverage);
      }
    }

    map.set(c.agent, a);
  }

  return [...map.values()].map(a => ({
    ...a,
    average: a.values.length
      ? Math.round(
          a.values.reduce((n, v) => n + v, 0) /
          a.values.length
        )
      : null,
    coverage: a.cover.length
      ? Math.round(
          a.cover.reduce((n, v) => n + v, 0) /
          a.cover.length
        )
      : null
  }));
}
