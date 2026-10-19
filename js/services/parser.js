
/**
 * QA-PARSER-001
 * Purpose: Parse multi-call Genesys tab-delimited exports.
 * Depends on: None.
 * Used by: app.js.
 * Impact: Interaction boundaries, timing and evidence lines.
 * Safeguard: Never merge multiple calls into one interaction.
 * Version: 2.0
 */

const clean = s =>
  String(s ?? "")
    .replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, "")
    .trim();

const time = s => {
  const m = String(s).match(/^(\d+):(\d{2})(?::(\d{2}))?$/);

  return m
    ? (m[3] === undefined
        ? +m[1] * 60 + +m[2]
        : +m[1] * 3600 + +m[2] * 60 + +m[3])
    : null;
};

function parseBlock(block, i) {
  const ls = block.split(/\r?\n/);

  const get = k => {
    const m = ls.find(s =>
      s.trim().toLowerCase().startsWith(k.toLowerCase() + ":")
    );

    return m ? clean(m.slice(m.indexOf(":") + 1)) : "";
  };

  const h = ls.findIndex(s =>
    /^Date\/Time\s*\t\s*Participant Type\s*\t/i.test(s)
  );

  const turns = [];

  if (h >= 0) {
    for (let j = h + 1; j < ls.length; j++) {
      const c = ls[j].split("\t");

      if (c.length < 4) continue;

      const p = clean(c[1]).toLowerCase();

      if (!["internal", "external"].includes(p)) continue;

      const text = clean(c.slice(3).join("\t"));

      if (!text) continue;

      turns.push({
        line: turns.length + 1,
        sourceLine: j + 1,
        seconds: time(clean(c[0])),
        timestamp: clean(c[0]),
        speaker: p === "internal" ? "agent" : "customer",
        text
      });
    }
  }

  return {
    key: "call-" + i,
    id: get("Interaction ID"),
    agent: get("Internal Participant(s)") || "Unidentified",
    duration: get("Transcript Duration"),
    direction: get("Direction"),
    start: get("Transcript Start Time"),
    turns,
    status: turns.length ? "READY" : "NO_TRANSCRIPT",
    findings: [],
    score: null,
    error: ""
  };
}

/**
 * QA-PARSER-002
 * Purpose: Detect multiple interactions and duplicate records.
 * Output: Array of individually identified conversations.
 */
export function parseExport(raw) {
  const text = String(raw).replace(/\r\n/g, "\n");

  const blocks = text
    .split(/(?=^Interaction Type\s*:)/gm)
    .filter(x => /^Interaction Type\s*:/m.test(x));

  let calls = blocks.map(parseBlock);

  // Supports basic single-call transcripts for testing.
  if (!calls.length) {
    const turns = [];

    for (const line of text.split("\n")) {
      const m = line.match(
        /^\s*(?:\[(\d+:\d{2}(?::\d{2})?)\]\s*)?(Agent|Customer)\s*:\s*(.+)$/i
      );

      if (m) {
        turns.push({
          line: turns.length + 1,
          seconds: m[1] ? time(m[1]) : null,
          timestamp: m[1] || "",
          speaker: m[2].toLowerCase(),
          text: clean(m[3])
        });
      }
    }

    if (!turns.length) {
      throw Error(
        "No Genesys export or speaker-labelled dialogue detected."
      );
    }

    calls = [{
      key: "call-0",
      id: "MANUAL-001",
      agent: "Sample Agent",
      duration: "",
      direction: "",
      start: "",
      turns,
      status: "READY",
      findings: [],
      score: null,
      error: ""
    }];
  }

  const seen = new Set();

  for (const c of calls) {
    if (c.id && seen.has(c.id)) {
      c.status = "DUPLICATE";
    }

    if (c.id) seen.add(c.id);
  }

  return calls;
}
