import { DETERMINISTIC_RULES, linkedRules } from "./config.js";
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


/** QA-EXECUTE: deterministic checks, never infer absent event evidence as zero. */
const sources = {
 hold_single:["holdEvents","durationSeconds"],hold_total:["holdEvents","durationSeconds"],
 silence:["silenceEvents","durationSeconds"],transfer_count:["transferEvents"],
 transfer_notice:["transferEvents","noticeSeconds"],queue_wait:["queueWaitSeconds"],
 after_call_work:["afterCallWorkSeconds"],interaction_duration:["interactionDurationSeconds"],
 verification_steps:["verificationEvents"],ticket_creation:["ticketEvents"],
 disposition_match:["dispositionMatches"],callback_sla:["callbackCompletionHours"],
 escalation_sla:["escalationMinutes"],repeat_contact:["repeatContactDays"],
 first_contact_resolution:["fcrObservedDays"],recording_compliance:["recordingEvents"],
 channel_sla:["channelResponseSeconds"]
};
const phrases = {mandatory_greeting:"greetingTerms",mandatory_disclosure:"disclosureTerms",
 prohibited_phrase:"prohibitedTerms",closing_statement:"closingTerms"};
const minimum = new Set(["mandatory_greeting","mandatory_disclosure","closing_statement",
 "verification_steps","ticket_creation","disposition_match","recording_compliance","first_contact_resolution"]);
function executeRule(call,def,rule,rules) {
 const id=def.id,limit=Number(rule.value);
 const unknown=reason=>({id,text:def.name,state:"UNKNOWN",reason,evidence:[]});
 if(!Number.isFinite(limit)||limit<0)return unknown("Invalid rule threshold");
 const turns=call.turns||[];
 if(id==="greeting_time"||id==="fallback_greeting"){
  const first=turns.filter(t=>t.speaker==="agent").find(t=>
   (rules.greetingTerms||[]).some(term=>term&&t.text.toLowerCase().includes(term.toLowerCase())));
  if(!first||typeof first.seconds!=="number"||!Number.isFinite(first.seconds))
   return unknown("Timestamped greeting is not available");
  return {id,text:def.name,state:first.seconds<=limit?"MET":"MISSED",
   reason:"Greeting at "+first.seconds+"s; threshold "+limit+"s",
   evidence:[{line:first.line,quote:first.text}]};
 }
 if(phrases[id]){
  const terms=rules[phrases[id]];
  if(!Array.isArray(terms)||!terms.some(t=>String(t).trim()))
   return unknown("Approved "+phrases[id]+" phrase list is not configured");
  if(!turns.length)return unknown("Transcript is missing");
  const matches=turns.filter(t=>t.speaker==="agent"&&terms.some(term=>
   term&&t.text.toLowerCase().includes(String(term).toLowerCase())));
  const met=id==="prohibited_phrase"?matches.length<=limit:matches.length>=limit;
  return {id,text:def.name,state:met?"MET":"MISSED",
   reason:matches.length+" matching agent turns; threshold "+limit,
   evidence:matches.map(t=>({line:t.line,quote:t.text}))};
 }
 const spec=sources[id];
 if(!spec)return unknown("Rule evaluator is not configured");
 const evidence=call.evidence||{},raw=evidence[spec[0]];
 if(raw===undefined||raw===null)return unknown("Missing verified "+spec[0]+" evidence ("+def.source+")");
 let value;
 if(Array.isArray(raw)){
  if(spec[1]){
   const nums=raw.map(x=>x?.[spec[1]]);
   if(nums.some(n=>typeof n!=="number"||!Number.isFinite(n)||n<0))
    return unknown("Incomplete "+spec[0]+" event data");
   if(id==="transfer_notice"&&!nums.length)return unknown("No transfer event to assess");
   value=id==="hold_total"?nums.reduce((a,b)=>a+b,0):
    id==="hold_single"||id==="silence"?Math.max(0,...nums):
    id==="transfer_notice"?Math.min(...nums):nums.length;
  }else value=raw.length;
 }else value=raw;
 if(typeof value!=="number"||!Number.isFinite(value)||value<0)
  return unknown("Invalid "+spec[0]+" evidence");
 const met=minimum.has(id)?value>=limit:value<=limit;
 return {id,text:def.name,state:met?"MET":"MISSED",
  reason:"Observed "+value+"; threshold "+limit,
  evidence:[{line:0,quote:"Verified interaction evidence: "+spec[0]+" = "+value}]};
}
function combineCriterion(criterion,ai,checks){
  if(!checks.length && !criterion.checkpoints?.some(a=>a.enabled!==false))return ai;
  const anchors=[...(criterion.checkpoints?.some(a=>a.enabled!==false)?(ai?.anchors||[]):[]),...checks];
  const applicable=anchors.filter(a=>a.state!=="NA");
  const known=applicable.filter(a=>a.state==="MET"||a.state==="MISSED");
  const missing=applicable.filter(a=>a.state==="UNKNOWN");
  const weightFor=a=>{
    const anchor=criterion.checkpoints?.find(x=>x.id===a.id);
    const raw=anchor ? anchor.points : criterion.ruleWeights?.[a.id];
    return typeof raw==="number"&&Number.isFinite(raw)&&raw>=0?raw:1;
  };
  const total=applicable.reduce((sum,a)=>sum+weightFor(a),0);
  const passed=known.filter(a=>a.state==="MET").reduce((sum,a)=>sum+weightFor(a),0);
  const knownPoints=known.reduce((sum,a)=>sum+weightFor(a),0);
  const scored=known.length>0&&knownPoints>0;
  return {id:criterion.id,status:scored?"SCORED":!applicable.length?"NOT_APPLICABLE":"UNVERIFIABLE",
   score:scored?Math.round(100*passed/knownPoints):null,
   coverage:total?Math.round(100*knownPoints/total):0,
   reason:missing.length?missing.map(a=>a.text+": "+(a.reason||"Evidence missing")).join("; "):
    known.map(a=>a.reason||a.text).join("; "),anchors};
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
  if (!criterion.checkpoints?.some(a=>a.enabled!==false)) {
    return reported;
  }

  const found = new Map(
    (reported?.anchors || []).map(a => [
      a.id,
      a
    ])
  );

  const anchors = criterion.checkpoints.filter(a=>a.enabled!==false).map(a => {
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

  const enabled = rubric.criteria.filter(c => c.enabled);

  const ruleMap = new Map((rubric.rules.deterministic || []).map(r=>[r.id,r]));
  const checksById = new Map(enabled.map(c=>[c.id,
    linkedRules(c.id).map(id=>{
      const def=DETERMINISTIC_RULES.find(r=>r.id===id);
      const rule=ruleMap.get(id);
      return def && rule?.enabled ? executeRule(call,def,rule,rubric.rules) : null;
    }).filter(Boolean)
  ]));
  const local = new Map(enabled.map(c=>[c.id,
    combineCriterion(c, empty(c,"Awaiting configured qualitative evaluation"), checksById.get(c.id))
  ]));

  call.findings = enabled.map(
    c => local.get(c.id)
  );

  call.score = overall(
    call.findings,
    rubric
  );

  onStage("rules", call);

  const ai = enabled.filter(c => c.checkpoints?.some(a=>a.enabled!==false));

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
            checkpoints: c.checkpoints.filter(a=>a.enabled!==false)
          })),

          turns: call.turns.map(t => ({
            line: t.line,
            speaker: t.speaker,
            text: redact(t.text),
            timestamp: t.timestamp || "",
            seconds: Number.isFinite(t.seconds) ? t.seconds : null
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
      c.checkpoints?.some(a=>a.enabled!==false)
        ? combineCriterion(c, calculateCriterion(c,returned.get(c.id)), checksById.get(c.id))
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
