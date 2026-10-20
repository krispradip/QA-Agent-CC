/**
 * QA-ENGINE-001 | Qualis v2.2.0
 *
 * Model-independent evidence scoring.
 *
 * The LLM reports:
 * MET / MISSED / UNKNOWN / NA
 *
 * Qualis calculates percentages deterministically.
 * Evidence gaps do not receive invented scores.
 */

export const allowedStates = [
  "MET",
  "MISSED",
  "UNKNOWN",
  "NA"
];

function empty(criterion, note) {
  return {
    id: criterion.id,
    status: "UNVERIFIABLE",
    score: null,
    coverage: 0,
    reason: note,

    anchors: (criterion.checkpoints || []).map(a => ({
      id: a.id,
      text: a.text,
      state: "UNKNOWN",
      evidence: []
    }))
  };
}

/**
 * QA-ENGINE-RULES
 * Deterministic rules for transcript-observable criteria.
 */
export function localFinding(call, criterion, rules) {
  if (criterion.mode !== "timing") {
    const reason =
      criterion.mode === "audio"
        ? "Audio or event records required"
        : criterion.mode === "external"
          ? "System records, trusted identity or SOP required"
          : "Awaiting AI assessment";

    return empty(criterion, reason);
  }

  const first = call.turns
    .filter(t => t.speaker === "agent")
    .find(t =>
      (rules.greetingTerms || []).some(term =>
        term &&
        t.text.toLocaleLowerCase()
          .includes(term.toLocaleLowerCase())
      )
    );

  if (!first || first.seconds === null) {
    return empty(
      criterion,
      "Recognizable, timestamped greeting not reliably available"
    );
  }

  const limit = Number(
    rules[criterion.id]
  );

  if (!Number.isFinite(limit)) {
    return empty(
      criterion,
      "Timing threshold invalid"
    );
  }

  const met = first.seconds <= limit;

  return {
    id: criterion.id,
    status: "SCORED",
    score: met ? 100 : 0,
    coverage: 100,

    reason:
      `Recognized greeting at ${first.timestamp}; ` +
      `threshold ${limit}s`,

    anchors: [{
      id: criterion.id + "-timing",
      text: `Greeting within ${limit}s`,
      state: met ? "MET" : "MISSED",

      evidence: [{
        line: first.line,
        quote: first.text
      }]
    }]
  };
}

/**
 * QA-ENGINE-ANCHORS
 *
 * Converts standardized model observations into
 * a deterministic criterion percentage.
 *
 * One unsupported applicable checkpoint causes
 * the criterion to remain unscored.
 */
export function calculateCriterion(
  criterion,
  reported
) {
  if (criterion.mode !== "ai") {
    return reported;
  }

  const found = new Map(
    (reported?.anchors || []).map(a => [
      a.id,
      a
    ])
  );

  const anchors = criterion.checkpoints.map(a => {
    const b = found.get(a.id) || {};

    const state = allowedStates.includes(b.state)
      ? b.state
      : "UNKNOWN";

    const evidence = Array.isArray(b.evidence)
      ? b.evidence
      : [];

    return {
      ...a,

      state:
        ["MET", "MISSED"].includes(state) &&
        !evidence.length
          ? "UNKNOWN"
          : state,

      evidence
    };
  });

  const applicable = anchors.filter(
    a => a.state !== "NA"
  );

  const evaluated = applicable.filter(a =>
    ["MET", "MISSED"].includes(a.state)
  );

  const coverage = applicable.length
    ? Math.round(
        100 * evaluated.length / applicable.length
      )
    : 0;

  const allKnown =
    applicable.length > 0 &&
    evaluated.length === applicable.length;

  return {
    id: criterion.id,

    status: allKnown
      ? "SCORED"
      : applicable.length
        ? "UNVERIFIABLE"
        : "NOT_APPLICABLE",

    score: allKnown
      ? Math.round(
          100 *
          evaluated.filter(a => a.state === "MET").length /
          applicable.length
        )
      : null,

    coverage,

    reason: String(
      reported?.reason ||
      "Insufficient evidence to score all checkpoints"
    ),

    anchors
  };
}

/**
 * QA-ENGINE-OVERALL
 * Weighted score across fully assessed criteria.
 *
 * Score and coverage are separate outputs.
 */
export function overall(findings, rubric) {
  const byId = new Map(
    rubric.criteria.map(c => [
      c.id,
      c
    ])
  );

  const relevant = findings.filter(f =>
    byId.get(f.id)?.enabled &&
    Number(byId.get(f.id)?.weight) > 0
  );

  const scored = relevant.filter(f =>
    f.status === "SCORED" &&
    f.score !== null
  );

  const denom = scored.reduce(
    (s, f) =>
      s + Number(byId.get(f.id).weight),
    0
  );

  const num = scored.reduce(
    (s, f) =>
      s +
      Number(byId.get(f.id).weight) * f.score,
    0
  );

  const coverageWeight = relevant
    .filter(f =>
      f.status !== "NOT_APPLICABLE"
    )
    .reduce(
      (s, f) =>
        s + Number(byId.get(f.id).weight),
      0
    );

  return {
    score: denom
      ? Math.round(num / denom)
      : null,

    coverage: coverageWeight
      ? Math.round(
          100 * denom / coverageWeight
        )
      : 0,

    scored: scored.length,
    total: relevant.length,

    notVerifiable: relevant.filter(
      f => f.status === "UNVERIFIABLE"
    ).length
  };
}

/**
 * QA-ENGINE-PRIVACY
 *
 * Basic PII masking before sending dialogue
 * outside the browser.
 *
 * Not a replacement for approved enterprise DLP.
 */
function redact(text) {
  return String(text)
    .replace(
      /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,
      "[EMAIL]"
    )
    .replace(
      /\+?\d[\d\s().-]{7,}\d/g,
      "[NUMBER]"
    );
}

/**
 * QA-ENGINE-ASSESS
 *
 * Evaluate one call.
 * Local rules -> Gemini evidence -> Qualis score.
 */
export async function assess(
  call,
  rubric,
  signal,
  onStage
) {
  call.status = "RUNNING";

  const enabled = rubric.criteria.filter(
    c => c.enabled
  );

  const local = new Map(
    enabled.map(c => [
      c.id,
      localFinding(call, c, rubric.rules)
    ])
  );

  call.findings = enabled.map(
    c => local.get(c.id)
  );

  call.score = overall(
    call.findings,
    rubric
  );

  onStage("rules", call);

  const ai = enabled.filter(
    c => c.mode === "ai"
  );

  if (ai.length) {
    onStage("ai", call);

    const response = await fetch(
      "/api/evaluate",
      {
        method: "POST",
        signal,

        headers: {
          "content-type": "application/json"
        },

        body: JSON.stringify({
          model: rubric.model,
          instructions: rubric.instructions,

          criteria: ai.map(c => ({
            id: c.id,
            name: c.name,
            definition: c.definition,
            instructions: c.instructions,
            checkpoints: c.checkpoints
          })),

          turns: call.turns.map(t => ({
            line: t.line,
            speaker: t.speaker,
            text: redact(t.text)
          }))
        })
      }
    );

    const payload = await response.json()
      .catch(() => ({}));

    if (!response.ok) {
      const err = Error(
        payload.error ||
        `AI service HTTP ${response.status}`
      );

      err.status = response.status;
      throw err;
    }

    onStage("validating", call);

    const returned = new Map(
      (payload.findings || []).map(f => [
        f.id,
        f
      ])
    );

    call.findings = enabled.map(c =>
      c.mode === "ai"
        ? calculateCriterion(
            c,
            returned.get(c.id)
          )
        : local.get(c.id)
    );

    call.score = overall(
      call.findings,
      rubric
    );
  }

  call.status = "COMPLETE";
  call.error = "";

  /**
   * Preserve the historical rubric context,
   * even if configuration changes later.
   */
  call.meta = {
    rubricRevision: rubric.revision,
    model: rubric.model,
    version: rubric.version,
    at: new Date().toISOString(),

    criteria: enabled.map(c => ({
      id: c.id,
      name: c.name,
      group: c.group,
      weight: c.weight,
      checkpoints: c.checkpoints
    }))
  };

  onStage("complete", call);
}

/**
 * QA-ENGINE-AGGREGATE
 * Produce performance summaries per agent.
 */
export function agents(calls) {
  const map = new Map();

  for (const c of calls) {
    if (c.status === "DUPLICATE") {
      continue;
    }

    const a = map.get(c.agent) || {
      agent: c.agent,
      imported: 0,
      completed: 0,
      scores: [],
      coverages: []
    };

    a.imported++;

    if (c.status === "COMPLETE") {
      a.completed++;

      if (c.score?.score !== null) {
        a.scores.push(c.score.score);
        a.coverages.push(c.score.coverage);
      }
    }

    map.set(c.agent, a);
  }

  return [...map.values()].map(a => ({
    ...a,

    average: a.scores.length
      ? Math.round(
          a.scores.reduce(
            (x, y) => x + y,
            0
          ) / a.scores.length
        )
      : null,

    coverage: a.coverages.length
      ? Math.round(
          a.coverages.reduce(
            (x, y) => x + y,
            0
          ) / a.coverages.length
        )
      : null
  }));
}
