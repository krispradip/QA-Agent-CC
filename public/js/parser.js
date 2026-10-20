/**
 * QA-PARSE-001 | Qualis v2.2.0
 *
 * Transcript intake:
 * Genesys multi-call TXT/TSV, CSV, JSON,
 * SRT, WebVTT, timestamped and speaker-labelled text.
 *
 * Ambiguous speaker identities must be mapped by
 * the uploader rather than guessed by the evaluator.
 */

const tidy = x =>
  String(x ?? "")
    .replace(
      /[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g,
      ""
    )
    .trim();

const seconds = s => {
  const m = tidy(s).match(
    /^(\d+):(\d{2})(?::(\d{2})(?:[.,]\d+)?)?$/
  );

  if (!m) return null;

  return m[3] === undefined
    ? +m[1] * 60 + +m[2]
    : +m[1] * 3600 + +m[2] * 60 + +m[3];
};

const roleOf = s =>
  /^(agent|advisor|representative|internal|operator)(\b|\s)/i
    .test(s)
    ? "agent"
    : /^(customer|caller|client|external|consumer)(\b|\s)/i
      .test(s)
      ? "customer"
      : null;

/**
 * QA-PARSE-NORMALIZE
 * Creates a consistent internal interaction structure.
 */
function finalize(calls) {
  const seen = new Set();

  return calls.map((c, i) => {
    const id = tidy(c.id);

    const turns = (c.turns || [])
      .filter(t => tidy(t.text))
      .map((t, n) => ({
        ...t,
        line: n + 1,
        text: tidy(t.text)
      }));

    const unmapped = turns.some(
      t => !["agent", "customer"].includes(t.speaker)
    );

    const labels = [
      ...new Set(
        turns
          .filter(t => t.speaker === "unknown")
          .map(t => t.label)
      )
    ].filter(Boolean);

    let status = turns.length
      ? unmapped
        ? "NEEDS_MAPPING"
        : "READY"
      : "NO_TRANSCRIPT";

    if (id && seen.has(id)) {
      status = "DUPLICATE";
    }

    if (id) seen.add(id);

    return {
      ...c,
      id,
      key: `call-${i + 1}`,
      agent: tidy(c.agent) || "Unidentified agent",
      turns,
      labels,
      status,
      score: null,
      findings: [],
      error: "",
      meta: null
    };
  });
}

/**
 * QA-PARSE-GENESYS
 * Reads an individual Genesys interaction block.
 */
function genesysBlock(block) {
  const lines = block.split(/\r?\n/);

  const field = name => {
    const row = lines.find(x =>
      new RegExp(
        "^\\s*" + name + "\\s*:",
        "i"
      ).test(x)
    );

    return row
      ? tidy(row.slice(row.indexOf(":") + 1))
      : "";
  };

  const head = lines.findIndex(x =>
    /^Date\/Time\s*\t\s*Participant Type\s*\t/i
      .test(x)
  );

  const turns = [];

  if (head >= 0) {
    for (let j = head + 1; j < lines.length; j++) {
      const col = lines[j].split("\t");

      if (col.length < 4) continue;

      const kind = tidy(col[1]).toLowerCase();

      if (!["internal", "external"].includes(kind)) {
        continue;
      }

      const text = tidy(
        col.slice(3).join("\t")
      );

      if (!text) continue;

      turns.push({
        timestamp: tidy(col[0]),
        seconds: seconds(col[0]),
        speaker: kind === "internal"
          ? "agent" : "customer",
        text
      });
    }
  }

  return {
    id: field("Interaction ID"),
    agent: field("Internal Participant\\(s\\)"),
    duration: field("Transcript Duration"),
    start: field("Transcript Start Time"),
    type: field("Interaction Type") || "Call",
    turns
  };
}

/**
 * QA-PARSE-JSON
 * Supports arrays of calls and common messages/segments shapes.
 */
function fromJSON(raw) {
  let parsed;

  try {
    parsed = JSON.parse(raw);
  } catch {
    throw Error("Invalid JSON transcript.");
  }

  const arr = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed.interactions)
      ? parsed.interactions
      : [parsed];

  return arr.map((x, i) => {
    const messages = Array.isArray(x.turns)
      ? x.turns
      : Array.isArray(x.transcript)
        ? x.transcript
        : Array.isArray(x.messages)
          ? x.messages
          : Array.isArray(x.segments)
            ? x.segments
            : [];

    return {
      id: String(
        x.interactionId ||
        x.conversationId ||
        x.id ||
        `json-${i + 1}`
      ),

      agent: String(
        x.agent ||
        x.agentName ||
        "Unidentified agent"
      ),

      type: x.type || "Call",
      duration: x.duration || "",
      start: x.start || "",

      turns: messages.map(t => {
        const label = tidy(
          t.speaker ||
          t.role ||
          t.participantType ||
          t.participant ||
          ""
        );

        return {
          timestamp: tidy(
            t.timestamp ||
            t.time ||
            t.start ||
            ""
          ),

          seconds: Number.isFinite(t.seconds)
            ? t.seconds
            : seconds(
                t.timestamp || t.time || t.start
              ),

          speaker: roleOf(label) || "unknown",
          label,

          text:
            t.text ||
            t.utterance ||
            t.content ||
            ""
        };
      })
    };
  });
}

/**
 * QA-PARSE-CSV
 * Handles comma-separated, quoted CSV rows.
 */
function csvRows(raw) {
  const rows = [];

  let row = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];

    if (c === '"') {
      if (quoted && raw[i + 1] === '"') {
        cell += '"';
        i++;
      } else {
        quoted = !quoted;
      }

    } else if (c === "," && !quoted) {
      row.push(cell);
      cell = "";

    } else if (
      (c === "\n" || c === "\r") &&
      !quoted
    ) {
      if (
        c === "\r" &&
        raw[i + 1] === "\n"
      ) i++;

      row.push(cell);

      if (row.some(v => v.trim())) {
        rows.push(row);
      }

      row = [];
      cell = "";

    } else {
      cell += c;
    }
  }

  row.push(cell);

  if (row.some(v => v.trim())) {
    rows.push(row);
  }

  return rows;
}

function fromCSV(raw) {
  const rows = csvRows(raw);

  const header = (rows.shift() || [])
    .map(s =>
      tidy(s)
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "")
    );

  const cell = (row, ...names) => {
    const n = names
      .map(k => header.indexOf(k))
      .find(x => x >= 0);

    return n === undefined
      ? ""
      : tidy(row[n]);
  };

  if (
    !header.some(x =>
      ["text", "utterance", "content"].includes(x)
    )
  ) {
    throw Error(
      "CSV needs a Text, Utterance or Content column."
    );
  }

  const map = new Map();

  for (const row of rows) {
    const id = cell(
      row,
      "interactionid",
      "conversationid",
      "callid"
    ) || "csv-1";

    if (!map.has(id)) {
      map.set(id, {
        id,
        agent: "Unidentified agent",
        type: "Call",
        duration: "",
        start: "",
        turns: []
      });
    }

    const c = map.get(id);

    const label =
      cell(
        row,
        "participanttype",
        "speakertype",
        "speaker",
        "role"
      ) ||
      cell(
        row,
        "participant",
        "participantname"
      );

    const speaker = roleOf(label) || "unknown";

    const person = cell(
      row,
      "agentname",
      "participant",
      "participantname"
    );

    if (speaker === "agent" && person) {
      c.agent = person;
    }

    const timestamp = cell(
      row,
      "datetime",
      "timestamp",
      "time",
      "starttime"
    );

    const text = cell(
      row,
      "text",
      "utterance",
      "content"
    );

    if (text) {
      c.turns.push({
        timestamp,
        seconds: seconds(timestamp),
        speaker,
        label,
        text
      });
    }
  }

  return [...map.values()];
}

/**
 * QA-PARSE-TEXT
 * Speaker-labelled and timestamped transcripts.
 * Also supports subtitle cues when speakers are labelled.
 */
function fromText(raw) {
  const turns = [];
  let lastTime = "";

  for (const row of raw.split(/\r?\n/)) {
    const line = tidy(row);

    if (
      !line ||
      /^(WEBVTT|\d+)$/i.test(line)
    ) {
      continue;
    }

    const cue = line.match(
      /^(\d{1,2}:\d{2}(?::\d{2})?(?:[.,]\d+)?)\s*-->\s*/
    );

    if (cue) {
      lastTime = cue[1];
      continue;
    }

    let m = line.match(
      /^\[?(\d{1,2}:\d{2}(?::\d{2})?(?:[.,]\d+)?)\]?\s+(.{1,75}?)\s*:\s*(.+)$/
    );

    if (m) {
      lastTime = m[1];
      m = [m[0], m[2], m[3]];

    } else {
      m = line.match(
        /^(.{1,75}?)\s*(?:\[\d{1,2}:\d{2}(?::\d{2})?\])?\s*:\s*(.+)$/
      );
    }

    if (!m) continue;

    const label = tidy(m[1]);
    const text = tidy(m[2]);

    if (
      /^(interaction|transcript|duration|start|end|insights|resolution|summary|direction|date)$/i
        .test(label)
    ) {
      continue;
    }

    const speaker = roleOf(label) || "unknown";

    if (text) {
      turns.push({
        timestamp: lastTime,
        seconds: seconds(lastTime),
        speaker,
        label,
        text
      });
    }

    lastTime = "";
  }

  if (!turns.length) {
    throw Error(
      "No recognizable dialogue. Supply speaker-labelled text " +
      "(for example Agent: ... / Customer: ...), " +
      "Genesys TXT/TSV, or structured CSV/JSON. " +
      "PDF/audio files require conversion."
    );
  }

  return [{
    id: "text-1",
    agent: "Unidentified agent",
    type: "Call",
    duration: "",
    start: "",
    turns
  }];
}

/**
 * QA-PARSE-MAPPING
 * Applies a user-confirmed agent speaker label.
 */
export function mapSpeakers(call, agentLabel) {
  if (!call.labels.includes(agentLabel)) {
    throw Error("Agent speaker label not found.");
  }

  call.turns = call.turns.map(t => ({
    ...t,

    speaker:
      t.speaker === "unknown"
        ? t.label === agentLabel
          ? "agent"
          : "customer"
        : t.speaker
  }));

  call.agent = agentLabel;

  call.status = call.turns.some(
    t => t.speaker === "unknown"
  )
    ? "NEEDS_MAPPING"
    : "READY";

  return call;
}

/**
 * QA-PARSE-ENTRY
 * Detects export structure, returns independent calls.
 */
export function parseExport(raw, filename = "") {
  const text = String(raw ?? "")
    .replace(/\r\n/g, "\n");

  if (!text.trim()) {
    throw Error("Transcript file is empty.");
  }

  let calls;

  const looksLikeJSON =
    /^[\s]*[\[{]/.test(text) &&
    /"(?:turns|interactions|messages|transcript)"/
      .test(text.slice(0, 3000));

  if (
    /\.json$/i.test(filename) ||
    looksLikeJSON
  ) {
    calls = fromJSON(text);

  } else if (/\.csv$/i.test(filename)) {
    calls = fromCSV(text);

  } else {
    const blocks = text
      .split(/(?=^Interaction Type\s*:)/gm)
      .filter(x =>
        /^Interaction Type\s*:/m.test(x)
      );

    calls = blocks.length
      ? blocks.map(genesysBlock)
      : fromText(text);
  }

  if (!calls.length) {
    throw Error("No interactions detected.");
  }

  return finalize(calls);
}

/**
 * A synthetic, non-customer demo interaction.
 */
export const SAMPLE = `English Transcript
Interaction Type:	Call
Interaction ID:	DEMO-QA-001
Transcript Duration:	01:18
Internal Participant(s):	Layla Demo
Date/Time	Participant Type	Participant	Text
00:03	Internal	Layla Demo	Good afternoon, thank you for calling SHARE, my name is Layla. How may I help?
00:10	External	Customer	My loyalty points have not been credited and I am really frustrated.
00:17	Internal	Layla Demo	I understand this is frustrating and I am sorry for the inconvenience. When did you shop?
00:27	External	Customer	Yesterday evening.
00:32	Internal	Layla Demo	Thank you. Let me explain the next steps to check your points.
01:03	External	Customer	Okay, thank you.
01:07	Internal	Layla Demo	Is there anything else I can help you with?
01:15	Internal	Layla Demo	Thank you for calling SHARE, have a lovely day.
`;
