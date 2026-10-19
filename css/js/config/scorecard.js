
/**
 * @component QA-CONFIG-001
 * @purpose SHARE call scorecard and default evaluator behaviour.
 * @dependsOn None
 * @usedBy core/evaluation.js, ui/workspace.js
 * @changeImpact Criteria coverage, weights, AI instructions.
 * @version 1.0
 */

const rows = [
  ["opening7","OPENING","Greeting within 7 seconds","timing"],
  ["opening10","OPENING","Greeting within 10 seconds","timing"],
  ["intro","OPENING","Branded call introduction","phrase"],

  ["questionImpact","CUSTOMER INFORMATION","Questioning affected resolution","ai"],
  ["questioning","CUSTOMER INFORMATION","Questioning skills","ai"],
  ["verification","CUSTOMER INFORMATION","Account verification","external"],

  ["interruption","LISTENING SKILLS","Avoid interruption","audio"],
  ["ack","LISTENING SKILLS","Acknowledgement","phrase"],
  ["repetition","LISTENING SKILLS","Avoid customer repetition","ai"],
  ["empathy","LISTENING SKILLS","Empathy and concern","ai"],

  ["pace","COMMUNICATION","Conversational pace","audio"],
  ["positive","COMMUNICATION","Positive communication","ai"],
  ["rapport","COMMUNICATION","Building rapport","ai"],
  ["tone","COMMUNICATION","Voice tone","audio"],
  ["conflict","COMMUNICATION","Conflict handling","ai"],
  ["deadAir","COMMUNICATION","Avoid dead air","audio"],
  ["nameTwice","COMMUNICATION","Customer name used twice","count"],

  ["solution","PROCESS","Accurate and complete solution","external"],
  ["systems","PROCESS","Correct system usage","external"],
  ["brand","PROCESS","Professional brand representation","ai"],
  ["callback","PROCESS","Callback process","external"],
  ["hold","PROCESS","Call hold process","external"],

  ["survey","CALL CLOSING","Post-call survey","phrase"],
  ["assistance","CALL CLOSING","Offer further assistance","phrase"],
  ["closing","CALL CLOSING","Branded call ending","phrase"],

  ["conduct","PROFESSIONAL CONDUCT","Avoid rude behaviour","ai"],
  ["disconnect","PROFESSIONAL CONDUCT","Avoid inappropriate disconnection","external"]
];

export function defaultConfig() {
  return {
    version: 1,
    provider: "gemini",
    model: "gemini-2.5-flash",

    evaluatorInstructions:
      "You are a strict, objective SHARE contact centre QA evaluator. " +
      "Evaluate only the assigned criteria against observable transcript " +
      "evidence. Never invent events, actions, policies or customer emotions. " +
      "Use NOT_VERIFIABLE when the evidence is insufficient. " +
      "Use NOT_APPLICABLE when a criterion genuinely does not apply. " +
      "Provide concise, specific coaching only where warranted.",

    rules: {
      greetingSeconds: 7,
      fallbackGreetingSeconds: 10,
      customerNameCount: 2,
      brandPhrases: [
        "welcome to share",
        "thank you for calling share"
      ],
      acknowledgementPhrases: [
        "i understand",
        "i see",
        "understood",
        "certainly"
      ],
      surveyPhrases: ["survey"],
      assistancePhrases: [
        "anything else",
        "further assistance",
        "any other questions"
      ],
      closingPhrases: [
        "thank you for your loyalty",
        "have a wonderful day"
      ]
    },

    criteria: rows.map(([id,category,name,type]) => ({
      id, category, name, type,
      weight: 5,
      enabled: id !== "opening10"
    }))
  };
}
