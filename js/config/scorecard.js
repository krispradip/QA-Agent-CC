
/**
 * QA-CONFIG-001
 * Purpose: Canonical SHARE 27-parameter scorecard.
 * Used by: Store, rules, UI and evaluation API.
 * Impact: Changing definitions affects future QA interpretation.
 * Version: 2.0
 */

const rows = [
  [
    "greeting7", "OPENING",
    "Greeting within 7 seconds", "timing",
    "Start standard greeting within 7 seconds of connection."
  ],
  [
    "greeting10", "OPENING",
    "Greeting within 10 seconds", "timing",
    "Fallback timing when the customer remains connected."
  ],
  [
    "intro", "OPENING",
    "Branded call introduction", "phrase",
    "Use SHARE branding, introduce yourself and offer help."
  ],
  [
    "questionImpact", "CUSTOMER INFORMATION",
    "Questioning affected resolution", "ai",
    "Assess whether irrelevant questioning demonstrably impeded resolution."
  ],
  [
    "questioning", "CUSTOMER INFORMATION",
    "Questioning skills", "ai",
    "Ask relevant open and closed questions without needless delay."
  ],
  [
    "verification", "CUSTOMER INFORMATION",
    "Account verification", "external",
    "Follow approved authentication matrix; never request unnecessary secrets."
  ],
  [
    "interruption", "LISTENING SKILLS",
    "Avoid interruption", "audio",
    "Allow the customer to finish without inappropriate overlapping speech."
  ],
  [
    "ack", "LISTENING SKILLS",
    "Acknowledgement / verbal nods", "phrase",
    "Acknowledge the customer meaningfully."
  ],
  [
    "repetition", "LISTENING SKILLS",
    "Avoid customer repetition", "ai",
    "Do not request information already clearly supplied without a valid reason."
  ],
  [
    "empathy", "LISTENING SKILLS",
    "Empathy and concern", "ai",
    "Respond appropriately to customer frustration or concern."
  ],
  [
    "pace", "COMMUNICATION SKILLS",
    "Conversational pace", "audio",
    "Maintain an understandable pace."
  ],
  [
    "positive", "COMMUNICATION SKILLS",
    "Professional positive statements", "ai",
    "Emphasize solutions over blunt negatives."
  ],
  [
    "rapport", "COMMUNICATION SKILLS",
    "Building rapport", "ai",
    "Maintain a respectful, attentive connection; avoid speculative personality ratings."
  ],
  [
    "tone", "COMMUNICATION SKILLS",
    "Voice tone", "audio",
    "Use professional, warm and confident voice tone."
  ],
  [
    "conflict", "COMMUNICATION SKILLS",
    "Avoid arguments / handle conflict", "ai",
    "Handle disagreement calmly and respectfully."
  ],
  [
    "deadAir", "COMMUNICATION SKILLS",
    "No dead air", "audio",
    "Avoid unexplained extended silence."
  ],
  [
    "nameTwice", "COMMUNICATION SKILLS",
    "Use customer name twice", "count",
    "Use known customer preferred name at least twice."
  ],
  [
    "solution", "PROCESS & PROCEDURES",
    "Complete and accurate information", "external",
    "Validate factual advice against approved SOP."
  ],
  [
    "systems", "PROCESS & PROCEDURES",
    "System usage", "external",
    "Use relevant systems correctly."
  ],
  [
    "brand", "PROCESS & PROCEDURES",
    "Professional brand representation", "ai",
    "Use language reflecting professional SHARE conduct."
  ],
  [
    "callback", "PROCESS & PROCEDURES",
    "Callback process", "external",
    "Honor callbacks per recorded workflow."
  ],
  [
    "hold", "PROCESS & PROCEDURES",
    "Call hold process", "external",
    "Explain, request permission, and follow hold event limits."
  ],
  [
    "survey", "CALL CLOSING",
    "Post-call survey", "phrase",
    "Mention the survey without pressuring the customer."
  ],
  [
    "assistance", "CALL CLOSING",
    "Further assistance", "phrase",
    "Offer further assistance before closing."
  ],
  [
    "closing", "CALL CLOSING",
    "Appropriate branded ending", "phrase",
    "Thank the customer and close with SHARE branding."
  ],
  [
    "conduct", "PROFESSIONAL CONDUCT",
    "Avoid rude behaviour", "ai",
    "Avoid disrespectful or dismissive language."
  ],
  [
    "disconnect", "PROFESSIONAL CONDUCT",
    "No inappropriate disconnection", "external",
    "Avoid unexplained disconnection or nonresponse."
  ]
];

export const GROUPS = [...new Set(rows.map(r => r[1]))];

export const DEFAULT_CONFIG = {
  version: 2,
  model: "gemini-2.5-flash-lite",
  instructions:
    "Be objective, evidence-based and concise. " +
    "Use NOT_VERIFIABLE when the transcript cannot establish compliance. " +
    "Never invent actions, policies or speech. " +
    "Recognize ASR errors and mixed Arabic-English conversations.",

  threshold: 80,

  rules: {
    greeting7: 7,
    greeting10: 10,
    nameTwice: 2,

    intro: [
      "welcome to share",
      "thank you for calling share"
    ],
    ack: [
      "i understand",
      "i see",
      "understood",
      "certainly",
      "أفهم",
      "حاضر"
    ],
    survey: ["survey", "استبيان"],
    assistance: [
      "anything else",
      "further assistance",
      "أي مساعدة أخرى"
    ],
    closing: [
      "thank you for your loyalty",
      "have a wonderful day",
      "شكرا لاتصالك"
    ]
  },

  criteria: rows.map(([id, group, name, type, definition]) => ({
    id,
    group,
    name,
    type,
    definition,
    guidance:
      "Evaluate only observable behaviour; do not infer missing evidence.",
    aiInstructions: "",
    weight: 5,
    enabled: id !== "greeting10"
  }))
};

export const AI_IDS = new Set(
  rows.filter(r => r[3] === "ai").map(r => r[0])
);
