
/**
 * @component QA-CORE-001
 * @purpose Transcript parsing, deterministic checks and scoring.
 * @dependsOn config/scorecard.js
 * @usedBy app.js, ui/workspace.js
 * @changeImpact Evidence, assessment status, score calculation.
 * @safety Missing evidence cannot automatically become PASS.
 * @version 1.0
 */

import { defaultConfig } from "../config/scorecard.js";

const KEY = "qualis-poc-config-v1";

export function loadConfig() {
  const base = defaultConfig();
  try {
    const saved = JSON.parse(localStorage.getItem(KEY));
    if (!saved || !Array.isArray(saved.criteria)) return base;

    const savedById = new Map(saved.criteria.map(c => [c.id,c]));
    return {
      ...base,
      ...saved,
      rules: { ...base.rules, ...saved.rules },
      criteria: base.criteria.map(c => {
        const old = savedById.get(c.id);
        return old ? {
          ...c,
          enabled: Boolean(old.enabled),
          weight: Number.isFinite(old.weight) &&
                  old.weight >= 0 && old.weight <= 100
            ? old.weight : c.weight
        } : c;
      })
    };
  } catch {
    return base;
  }
}

export function saveConfig(config) {
  localStorage.setItem(KEY, JSON.stringify(config));
}

/**
 * @component QA-PARSER-001
 * @purpose Convert uploaded transcript data into ordered turns.
 * @input TXT text or CSV/JSON normalized by the UI.
 * @output {line,speaker,text,seconds}[]
 * @limitation Timing is only trustworthy when timestamps
 * are explicitly call-relative.
 */
export function parseTranscript(raw) {
  return String(raw).split(/\r?\n/).map((line,index) => {
    const match = line.match(
      /^\s*(?:\[(\d{1,2}):(\d{2})(?::(\d{2}))?\]\s*)?(Agent|Customer)\s*:\s*(.+)$/i
    );
    if (!match) return null;

    let seconds = null;
    if (match[1] !== undefined) {
      seconds = match[3] === undefined
        ? Number(match[1])*60 + Number(match[2])
        : Number(match[1])*3600 +
          Number(match[2])*60 + Number(match[3]);
    }

    return {
      line: index+1,
      speaker: match[4].toLowerCase(),
      text: match[5].trim(),
      seconds
    };
  }).filter(Boolean);
}

function finding(c,status,reason,turn=null) {
  return {
    id:c.id,
    status,
    reason,
    evidence:turn ? [{
      line:turn.line,
      quote:turn.text
    }] : [],
    coaching:""
  };
}

function matchPhrase(turns,phrases) {
  if (!Array.isArray(phrases) || !phrases.length) return null;
  return turns.find(t => phrases.some(p =>
    p && t.text.toLowerCase().includes(p.toLowerCase())
  ));
}

/**
 * @component QA-RULES-001
 * @purpose Apply editable deterministic rules.
 * @configuration config.rules
 * @dependsOn parseTranscript output
 * @changeImpact Criterion status and score.
 */
export function runRules(turns,config,metadata={}) {
  const agent = turns.filter(t=>t.speaker==="agent");
  const enabled = config.criteria.filter(c=>c.enabled);
  const rules = config.rules;

  return enabled.map(c => {
    const nv = reason => finding(c,"NOT_VERIFIABLE",reason);

    if (c.type==="ai") {
      return nv("Awaiting live Gemini evaluation.");
    }
    if (c.type==="audio") {
      return nv("Requires audio or verified speech timing data.");
    }
    if (c.type==="external") {
      return nv("Requires approved system, policy or call-event evidence.");
    }
    if (!agent.length) return nv("No agent turns identified.");

    if (c.id==="opening7" || c.id==="opening10") {
      if (!metadata.timestampsAreCallRelative) {
        return nv("Connection-relative timestamps not confirmed.");
      }
      const first=agent[0];
      if (first.seconds===null) return nv("No greeting timestamp.");
      const limit=c.id==="opening7"
        ? rules.greetingSeconds
        : rules.fallbackGreetingSeconds;
      return finding(c,first.seconds<=limit?"PASS":"FAIL",
        `First agent speech at ${first.seconds}s; threshold ${limit}s.`,
        first);
    }

    if (c.id==="nameTwice") {
      const name=String(metadata.customerName||"").trim();
      if (!name) return nv("Customer preferred name not provided.");
      const escaped=name.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
      const regex=new RegExp(`\\b${escaped}\\b`,"gi");
      const matches=agent.filter(t=>regex.test(t.text));
      const count=agent.reduce((n,t)=>{
        const all=t.text.match(new RegExp(`\\b${escaped}\\b`,"gi"));
        return n+(all?all.length:0);
      },0);
      return finding(c,
        count>=rules.customerNameCount?"PASS":"FAIL",
        `Used ${count} time(s); required ${rules.customerNameCount}.`,
        matches[0]||null);
    }

    const definitions={
      intro:[agent.slice(0,3),rules.brandPhrases],
      ack:[agent,rules.acknowledgementPhrases],
      survey:[agent.slice(-5),rules.surveyPhrases],
      assistance:[agent.slice(-5),rules.assistancePhrases],
      closing:[agent.slice(-4),rules.closingPhrases]
    };

    if (definitions[c.id]) {
      const [scope,phrases]=definitions[c.id];
      if (!phrases.length) return nv("No valid phrases configured.");
      const match=matchPhrase(scope,phrases);
      return finding(c,
        match?"PASS":"FAIL",
        match
          ? "Configured phrase detected."
          : "Configured phrase not detected in the agent turns.",
        match||null);
    }

    return nv("No deterministic evaluator available.");
  });
}

/**
 * @component QA-SCORING-001
 * @purpose Recalculate score after each evaluation stage.
 * @safety Unverifiable and non-applicable criteria are excluded.
 * @limitation A partial score must not be described as final QA.
 */
export function calculateScore(findings,criteria) {
  const weights=new Map(criteria.map(c=>[c.id,c.weight]));
  const assessed=findings.filter(f=>
    f.status==="PASS" || f.status==="FAIL"
  );
  const denominator=assessed.reduce((sum,f)=>
    sum+(weights.get(f.id)||0),0);
  const numerator=assessed.reduce((sum,f)=>
    sum+(f.status==="PASS"?(weights.get(f.id)||0):0),0);

  return {
    percent:denominator?Math.round(100*numerator/denominator):null,
    assessed:assessed.length,
    total:findings.length,
    coverage:findings.length
      ? Math.round(100*assessed.length/findings.length):0
  };
}
