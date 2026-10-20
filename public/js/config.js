/**
 * QA-CFG-001 — Qualis v2.2.0
 *
 * Canonical SHARE QA rubric.
 *
 * The application reads a runtime rubric.
 * Saving an edit does not rewrite app.js.
 * Instead, subsequent evaluations use the new revision.
 *
 * Changing criterion IDs or evaluator methods in source
 * requires reviewing engine.js and worker.js.
 */

const specs = [
  [
    "greet7", "OPENING",
    "Greeting within 7 seconds", "timing",
    "Identifiable greeting begins within 7 seconds of the call starting."
  ],
  [
    "greet10", "OPENING",
    "Greeting within 10 seconds (fallback)", "timing",
    "Alternative threshold, disabled by default to avoid double penalties."
  ],
  [
    "opening", "OPENING",
    "Call opening – introduction", "ai",
    "Provide a clear, professional SHARE introduction."
  ],
  [
    "impact", "CUSTOMER INFORMATION",
    "Questioning skills – resolution affected", "ai",
    "Questioning should not unnecessarily impede the outcome."
  ],
  [
    "questions", "CUSTOMER INFORMATION",
    "Questioning skills", "ai",
    "Ask appropriate questions to understand the issue."
  ],
  [
    "verification", "CUSTOMER INFORMATION",
    "Customer account/details verification", "external",
    "Verify account details in accordance with the approved procedure."
  ],
  [
    "interruption", "LISTENING SKILLS",
    "Avoid interruption", "audio",
    "Avoid inappropriate interruption or overlap."
  ],
  [
    "ack", "LISTENING SKILLS",
    "Acknowledgement / verbal nods", "ai",
    "Acknowledge the customer meaningfully."
  ],
  [
    "repeat", "LISTENING SKILLS",
    "Avoid customer repetition", "ai",
    "Avoid needless repetition of information the customer already gave."
  ],
  [
    "empathy", "LISTENING SKILLS",
    "Empathy and showing concern", "ai",
    "Show appropriate concern when the customer needs it."
  ],
  [
    "pace", "COMMUNICATION SKILLS",
    "Conversational pace", "audio",
    "Speak at an understandable conversational pace."
  ],
  [
    "positive", "COMMUNICATION SKILLS",
    "Professional communication – positive statements", "ai",
    "Use solution-oriented, professional language."
  ],
  [
    "rapport", "COMMUNICATION SKILLS",
    "Building rapport", "ai",
    "Build a respectful, attentive connection."
  ],
  [
    "tone", "COMMUNICATION SKILLS",
    "Voice tone", "audio",
    "Maintain an appropriate professional voice tone."
  ],
  [
    "conflict", "COMMUNICATION SKILLS",
    "Avoid arguments and handle conflict", "ai",
    "Handle disagreement calmly and constructively."
  ],
  [
    "deadAir", "COMMUNICATION SKILLS",
    "No dead air", "audio",
    "Avoid unexplained extended silence; requires audio or events."
  ],
  [
    "name", "COMMUNICATION SKILLS",
    "Use customer name twice", "external",
    "Use the reliably established customer preferred name at least twice."
  ],
  [
    "solution", "PROCESS & PROCEDURES",
    "Complete and accurate information/solution", "external",
    "Provide correct information according to current approved SOP."
  ],
  [
    "systems", "PROCESS & PROCEDURES",
    "System usage", "external",
    "Use the prescribed application and complete system steps."
  ],
  [
    "brand", "PROCESS & PROCEDURES",
    "Professional brand representation", "ai",
    "Represent SHARE professionally."
  ],
  [
    "callback", "PROCESS & PROCEDURES",
    "Call back process", "external",
    "Follow approved callback process."
  ],
  [
    "hold", "PROCESS & PROCEDURES",
    "Call hold process", "external",
    "Observe call/chat hold permission and duration policy."
  ],
  [
    "survey", "CALL CLOSING",
    "Post-call survey", "ai",
    "Mention the survey when the call reaches normal closing."
  ],
  [
    "assistance", "CALL CLOSING",
    "Further assistance", "ai",
    "Offer further assistance before normal closure."
  ],
  [
    "closing", "CALL CLOSING",
    "Appropriate call ending", "ai",
    "End politely and professionally with SHARE context."
  ],
  [
    "rude", "PROFESSIONAL CONDUCT",
    "Advisor avoided rude conduct", "ai",
    "Avoid rude or disrespectful speech."
  ],
  [
    "disconnect", "PROFESSIONAL CONDUCT",
    "No improper disconnection/nonresponse", "external",
    "Do not cause improper disconnection; requires Genesys event evidence."
  ]
];

/**
 * Scoring checkpoints are objective behaviour statements.
 * Each can be edited in QA Configuration.
 *
 * Gemini identifies MET, MISSED, UNKNOWN or NA.
 * Qualis performs the percentage calculation.
 */

const checkpoints = {
  opening: [
    "Identifies SHARE or the service appropriately",
    "Introduces the agent or provides a professional identity",
    "Invites the customer to explain the reason for contact"
  ],

  impact: [
    "Questions remain relevant to resolving the stated issue",
    "Avoids unnecessary repeated or detouring questions",
    "Questioning does not demonstrably obstruct progress"
  ],

  questions: [
    "Clarifies the customer need",
    "Asks relevant follow-up questions where needed",
    "Confirms understanding before proposing next steps"
  ],

  ack: [
    "Acknowledges important customer statements",
    "Acknowledgement fits the context",
    "Demonstrates that previous information was understood"
  ],

  repeat: [
    "Retains key information already provided",
    "Avoids unnecessary repeat requests",
    "Clarifies only where there is a genuine ambiguity"
  ],

  empathy: [
    "Recognises expressed difficulty or emotion",
    "Acknowledges the impact on the customer",
    "Responds with contextually appropriate concern"
  ],

  positive: [
    "Uses respectful and constructive language",
    "Explains available options or next steps",
    "Avoids needlessly blunt or discouraging replies"
  ],

  rapport: [
    "Responds attentively to the customer",
    "Maintains professional, respectful engagement",
    "Personalises responses using known interaction context"
  ],

  conflict: [
    "Does not argue or blame the customer",
    "Acknowledges disagreement or frustration calmly",
    "Offers a constructive next step when possible"
  ],

  brand: [
    "Uses respectful service language",
    "Represents the brand professionally",
    "Avoids statements that undermine customer trust"
  ],

  survey: [
    "Introduces the survey when there is a completed normal closing",
    "Explains the survey briefly and neutrally"
  ],

  assistance: [
    "Offers further help at the appropriate closing",
    "Allows the customer opportunity to raise another need"
  ],

  closing: [
    "Provides a polite closing response",
    "Acknowledges the end of the customer need",
    "Uses suitable SHARE or service wording"
  ],

  rude: [
    "Avoids insults, belittling or dismissive statements",
    "Responds respectfully to customer requests",
    "Avoids antagonistic or deliberately unhelpful language"
  ]
};

export const GROUPS = [
  ...new Set(specs.map(x => x[1]))
];

export const MODES = {
  ai: "AI + anchored scoring",
  timing: "Deterministic timing",
  audio: "Audio evidence required",
  external: "System / SOP evidence required"
};

export function defaultRubric() {
  return {
    version: "2.2.0",
    revision: 1,
    model: "gemini-3.5-flash-lite",

    instructions:
      "Identify only observable behaviours, cite exact dialogue turns, " +
      "be objective, recognise Arabic/English and ASR noise. " +
      "Do not assume CRM actions or unknown policy.",

    rules: {
      greet7: 7,
      greet10: 10,

      greetingTerms: [
        "hello",
        "good morning",
        "good afternoon",
        "good evening",
        "thank you for calling",
        "welcome to",
        "مرحبا",
        "صباح الخير",
        "مساء الخير",
        "أهلا",
        "شكرا لاتصالك"
      ]
    },

    criteria: specs.map(
      ([id, group, name, mode, definition]) => ({
        id,
        group,
        name,
        mode,
        definition,

        enabled: id !== "greet10",
        weight: 5,

        instructions:
          "Use evidence only. Unknown when unsupported; " +
          "not applicable only when genuinely irrelevant.",

        checkpoints: (checkpoints[id] || []).map(
          (text, i) => ({
            id: `${id}-${i + 1}`,
            text
          })
        )
      })
    )
  };
}

const KEY = "qualis-rubric-v2.2.0";

export function loadRubric() {
  const fresh = defaultRubric();

  try {
    const saved = JSON.parse(
      localStorage.getItem(KEY)
    );

    if (!saved) return fresh;

    const previous = new Map(
      (saved.criteria || []).map(
        c => [c.id, c]
      )
    );

    return {
      ...fresh,

      revision: Number.isInteger(saved.revision)
        ? saved.revision : 1,

      model: [
        "gemini-3.5-flash-lite",
        "gemini-2.5-flash-lite"
      ].includes(saved.model)
        ? saved.model : fresh.model,

      instructions:
        typeof saved.instructions === "string"
          ? saved.instructions
          : fresh.instructions,

      rules: {
        ...fresh.rules,
        ...saved.rules
      },

      criteria: fresh.criteria.map(c => {
        const old = previous.get(c.id) || {};

        return {
          ...c,
          ...old,

          id: c.id,
          group: c.group,
          mode: c.mode,

          checkpoints:
            c.mode === "ai" &&
            Array.isArray(old.checkpoints) &&
            old.checkpoints.length >= 1
              ? old.checkpoints
              : c.checkpoints
        };
      })
    };

  } catch {
    return fresh;
  }
}

export function saveRubric(rubric) {
  localStorage.setItem(
    KEY,
    JSON.stringify(rubric)
  );
}
