/**
 * QA-APP-001 | Qualis v2.2.0
 *
 * Application controller.
 *
 * Rubric edits change runtime configuration,
 * not app.js source code.
 *
 * Interaction data/results: browser memory.
 * Rubric settings: browser localStorage.
 */

import {
  loadRubric,
  saveRubric,
  linkedRules
} from "./config.js";

import {
  parseExport,
  mapSpeakers,
  SAMPLE
} from "./parser.js";

import {
  assess
} from "./engine.js";
import { loadHistory, saveHistory, mergeImported, clearHistory } from "./history.js";
import { applyPeriod } from "./reporting.js";

import {
  overview,
  studio,
  agentsView,
  configuration
} from "./ui.js";

const root = document.querySelector("#view");

const $ = selector =>
  document.querySelector(selector);

const state = {
  page: "overview",
  calls: [],
  selected: null,
  agentFilter: "",
  overviewAgent: "",
  period: { mode: "all", from: "", to: "" },
  search: "",
  importFeedback: "",
  pasteDraft: "",

  rubric: loadRubric(),

  criterion: "greet7",
  running: false,
  phase: "idle",

  message:
    "Upload a Genesys file or load the synthetic example",

  controller: null
};

const titles = {
  overview: [
    "QA Overview",
    "Quality intelligence across interactions and agents."
  ],

  studio: [
    "AI Evaluation Studio",
    "Upload one multi-agent export; evaluate one call or the full batch."
  ],

  agents: [
    "Agent Performance",
    "Trace each QA score to evaluated interactions."
  ],

  config: [
    "QA Configuration",
    "Edit the rubric checkpoints, rules and AI evaluator."
  ]
};

/**
 * QA-APP-RENDER
 * Render the selected application page.
 */
function render() {
  const [title, sub] = titles[state.page];

  $("#page-title").textContent = title;
  $("#page-sub").textContent = sub;

  document.querySelectorAll(
    "#nav [data-page]"
  ).forEach(button => {
    button.classList.toggle(
      "active",
      button.dataset.page === state.page
    );
  });

  root.innerHTML =
    state.page === "overview"
      ? overview(applyPeriod(state.calls, state.period).calls, state.rubric, state.overviewAgent, state.period, applyPeriod(state.calls, state.period))

      : state.page === "studio"
        ? studio(state)

        : state.page === "agents"
          ? agentsView(state)

          : configuration(
              state.rubric,
              state.criterion
            );

  filterRows();
}

/**
 * QA-APP-NOTICE
 * Display non-blocking status and errors.
 */
async function persist() {
  try { await saveHistory(state.calls.filter(c => c.status !== "RUNNING")); }
  catch(e) { notify("History could not be saved: " + e.message, true); }
}

function notify(message, error = false) {
  const el = $("#notice");

  el.textContent = message;

  el.className = error
    ? "notice error-note"
    : "notice";
}

function navigate(page) {
  if (state.running) return;

  state.page = page;
  render();
}

/**
 * QA-APP-FILTER
 * Filter the queue without recreating
 * the search input on every keystroke.
 */
function filterRows() {
  const q = state.search.trim().toLowerCase();

  root.querySelectorAll(
    "[data-call]"
  ).forEach(row => {
    const matchesSearch =
      row.dataset.search.includes(q);

    const matchesAgent =
      !state.agentFilter ||
      row.dataset.agentname === state.agentFilter;

    row.hidden = !(
      matchesSearch &&
      matchesAgent
    );
  });
}

/**
 * QA-APP-IMPORT
 *
 * Parse one transcript export.
 * Require mapping when named speakers have unknown roles.
 */
function load(text, filename) {
  if (state.running) {
    notify("Wait for the current evaluation to finish before importing.", true);
    return;
  }

  const incoming = parseExport(text, filename);
  // Keep the original pasted transcript visible even if mapping or evaluation is blocked.
  if (filename === "paste.txt") state.pasteDraft = text;
  const merged = mergeImported(state.calls, incoming);
  if (!merged.calls.length) {
    throw Error("No usable interactions found. Check speaker labels and transcript format.");
  }
  state.calls = merged.calls;

  for (const call of state.calls) {
    if (
      call.status === "NEEDS_MAPPING" &&
      call.labels.length
    ) {
      const wanted = prompt(
        `Speaker labels in ${call.id}:\n` +
        call.labels.join("\n") +
        "\n\nType the exact AGENT speaker label " +
        "to map the roles. " +
        "Cancel leaves this call unassessed.",

        call.labels[0]
      );

      if (
        wanted &&
        call.labels.includes(wanted)
      ) {
        mapSpeakers(call, wanted);
      }
    }
  }

  state.page = "studio";

  // Focus on the transcript just imported, including one assessed previously.
  const firstImported = incoming.find(c => c.status !== "DUPLICATE");
  // Imported parser keys are temporary. Resolve the stable merged key instead.
  const importedId = firstImported?.id;
  const matchingMerged = state.calls.find(c => c.id === importedId && c.status !== "DUPLICATE");
  state.selected = matchingMerged?.key ||
    state.calls.find(c => c.status === "READY")?.key ||
    state.calls[0]?.key || null;

  state.agentFilter = "";
  state.overviewAgent = "";
  state.search = "";
  state.phase = "idle";

  const ready = state.calls.filter(
    c => c.status === "READY"
  ).length;

  const complete = state.calls.filter(c => c.status === "COMPLETE").length;
  state.message = `${merged.added} new · ${merged.alreadyKnown} existing · ${merged.skipped} duplicates · ${ready} ready · ${complete} completed`;
  state.importFeedback = state.message + (merged.alreadyKnown
    ? " · Existing evaluations retained; select Re-evaluate to assess again."
    : " · Select Evaluate to start assessment.");

  // Save only after any manual speaker mapping has completed.
  void persist();
  render();
  notify(state.importFeedback);
}

const clone = value =>
  JSON.parse(JSON.stringify(value));

/**
 * QA-APP-STAGE
 * Update the animation with actual evaluation stages.
 */
function stage(phase, call) {
  state.phase = phase;

  state.message = ({
    rules:
      "Applying deterministic rules",

    ai:
      "Gemini identifying evidence checkpoints",

    validating:
      "Verifying evidence and calculating scores",

    complete:
      "Call assessment complete"
  })[phase] || phase;

  if (call) {
    state.message +=
      ` · ${call.agent}`;
  }

  if (state.page === "studio") {
    render();
  }
}

/**
 * QA-APP-BATCH
 *
 * Run selected call or all pending calls.
 *
 * Sequential execution prevents uncontrolled
 * parallel Gemini requests.
 *
 * Quota errors stop subsequent requests.
 */
async function run(all) {
  if (state.running) return;

  const target = all
    ? state.calls.filter(
        c => c.status === "READY"
      )
    : [
        state.calls.find(
          c => c.key === state.selected
        )
      ].filter(c =>
        c &&
        ["READY", "ERROR", "COMPLETE"].includes(c.status)
      );

  if (!target.length) {
    notify("No evaluable interaction selected. Check the import status and speaker mapping.", true);
    return;
  }

  /**
   * Lock the rubric during this batch.
   */
  const snapshot = clone(state.rubric);

  state.running = true;
  state.controller = new AbortController();

  let quota = false;
  let stopped = false;

  try {
    for (const call of target) {
      if (state.controller.signal.aborted) {
        stopped = true;
        break;
      }

      call.status = "READY";
      call.error = "";
      call.findings = [];
      call.score = null;

      state.selected = call.key;
      stage("rules", call);

      try {
        await assess(
          call,
          snapshot,
          state.controller.signal,
          stage
        );

      } catch (err) {
        if (state.controller.signal.aborted) {
          call.status = "READY";
          call.error = "";
          call.findings = [];
          call.score = null;

          stopped = true;
          break;
        }

        call.status = "ERROR";
        call.error = String(
          err.message || err
        );

        call.score = null;

        state.phase = "error";
        state.message =
          `Evaluation failed: ${call.error}`;

        if (err.status === 429) {
          quota = true;
          render();
          break;
        }
      }

      await persist();
      render();
    }

  } finally {
    state.running = false;
    state.controller = null;

    state.phase = quota
      ? "error"
      : "idle";

    state.message = quota
      ? "Gemini quota reached; pending calls remain ready"
      : stopped
        ? "Stopped — finished calls are retained"
        : "Evaluation cycle finished — inspect results";

    render();
  }
}

/**
 * QA-APP-CSV
 * Escape CSV and guard against spreadsheet formulas.
 */
function csv(rows) {
  const safe = value => {
    const s = String(value ?? "");

    const protectedValue =
      /^[=+@-]/.test(s)
        ? "'" + s
        : s;

    return '"' +
      protectedValue.replaceAll('"', '""') +
      '"';
  };

  return rows
    .map(row =>
      row.map(safe).join(",")
    )
    .join("\r\n");
}

/**
 * QA-APP-EXPORT
 * JSON: complete call-level findings and transcripts.
 * CSV: summarized interaction scores.
 */
function download(kind) {
  let content;
  let name;
  let type;

  if (kind === "json") {
    content = JSON.stringify({
      version: "2.2.0",
      exportedAt: new Date().toISOString(),
      calls: state.calls
    }, null, 2);

    name = "qualis-full-assessments.json";
    type = "application/json";

  } else {
    const rows = [[
      "Interaction ID",
      "Agent",
      "Status",
      "QA Score",
      "Coverage",
      "Rubric revision",
      "Model"
    ]];

    for (const c of state.calls) {
      rows.push([
        c.id,
        c.agent,
        c.status,
        c.score?.score ?? "",
        c.score?.coverage ?? "",
        c.meta?.rubricRevision ?? "",
        c.meta?.model ?? ""
      ]);
    }

    content = csv(rows);
    name = "qualis-call-summary.csv";
    type = "text/csv";
  }

  const url = URL.createObjectURL(
    new Blob(
      [content],
      { type }
    )
  );

  const a = document.createElement("a");

  a.href = url;
  a.download = name;
  a.click();

  setTimeout(
    () => URL.revokeObjectURL(url),
    1500
  );
}

/**
 * QA-APP-SAVE
 * Increase rubric revision when settings change.
 */
function save(message) {
  state.rubric.revision++;

  saveRubric(state.rubric);

  render();
  notify(message);
}

/**
 * Sidebar navigation.
 */
document.querySelector("#nav")
  .addEventListener("click", event => {
    const button = event.target.closest(
      "button[data-page]"
    );

    if (button) {
      navigate(button.dataset.page);
    }
  });

/**
 * Dynamic button and row actions.
 */
root.addEventListener("click", event => {
  const button = event.target.closest(
    "button,[data-call]"
  );

  if (!button) return;

  if (button.dataset.pageGo) {
    navigate(button.dataset.pageGo);
    return;
  }

  if (button.id === "clearHistory") {
    if (state.running || !confirm("Permanently delete saved Qualis interaction history from this browser?")) return;
    void clearHistory().then(() => { state.calls = []; state.selected = null; render(); notify("Saved history cleared."); }).catch(e => notify(e.message, true));
    return;
  }

  if (button.dataset.dashboardAgent !== undefined) {
    state.overviewAgent = button.dataset.dashboardAgent;
    render();
    return;
  }

  if (button.dataset.agent !== undefined) {
    state.agentFilter = button.dataset.agent;
    navigate("agents");
    return;
  }

  if (button.dataset.call) {
    state.selected = button.dataset.call;
    render();
    return;
  }

  if (button.dataset.open) {
    state.selected = button.dataset.open;
    state.agentFilter = "";

    navigate("studio");
    return;
  }

  if (button.id === "clearAgent") {
    state.agentFilter = "";
    render();
    return;
  }

  if (button.id === "demo") {
    load(SAMPLE, "demo.txt");
    return;
  }

  if (button.id === "pasteLoad") {
    try {
      const pasted = $("#paste").value;
      state.pasteDraft = pasted;
      load(pasted, "paste.txt");
    } catch (err) {
      state.importFeedback = "Import failed: " + String(err.message || err);
      const label = root.querySelector("#import-feedback");
      if (label) label.textContent = state.importFeedback;
      notify(state.importFeedback, true);
    }
    return;
  }

  if (button.id === "all") {
    run(true);
    return;
  }

  if (button.id === "one") {
    run(false);
    return;
  }

  if (button.id === "stop") {
    state.controller?.abort();
    return;
  }

  if (
    button.id === "json" ||
    button.id === "csv"
  ) {
    download(button.id);
    return;
  }

  if (button.dataset.criterion) {
    state.criterion =
      button.dataset.criterion;

    render();
    return;
  }

  /**
   * Save one parameter.
   */
  if (button.id === "saveCriterion") {
    const c = state.rubric.criteria.find(
      x => x.id === state.criterion
    );

    const weight = Number(
      $("#cWeight").value
    );

    if (
      !c ||
      !$("#cName").value.trim() ||
      !Number.isFinite(weight) ||
      weight < 0 ||
      weight > 100
    ) {
      notify(
        "Parameter name and weight 0–100 are required",
        true
      );
      return;
    }

    const name = $("#cName").value.trim();
    const definition =
      $("#cDefinition").value.trim();

    const instructions =
      $("#cInstruction").value.trim();

    let newCheckpoints = c.checkpoints;

    if (c.checkpoints.length) {
      const inputs = [...root.querySelectorAll("[data-anchor-text]")];
      const items = inputs.map(input => ({
        id: c.id + "-" + (Number(input.dataset.anchorText) + 1),
        text: input.value.trim(),
        enabled: !!root.querySelector('[data-anchor-enabled="' + input.dataset.anchorText + '"]')?.checked,
        points: Number(root.querySelector('[data-anchor-points="' + input.dataset.anchorText + '"]')?.value)
      }));
      if (!items.length || items.length > 12 || items.some(x=>!x.text || x.text.length>250 || !Number.isFinite(x.points) || x.points<0 || x.points>100)) {
        notify("Each evaluation check requires a description (maximum 250 characters).",true);
        return;
      }
      newCheckpoints = items;
    }

    // Persist nested quantitative rules with the same rubric revision.
    const editedRules = [...root.querySelectorAll("[data-rule-value]")].map(input => ({
      id: input.dataset.ruleValue,
      enabled: !!root.querySelector('[data-rule-enabled="' + input.dataset.ruleValue + '"]')?.checked,
      value: input.value.trim() === "" ? NaN : Number(input.value)
    }));
    if (editedRules.some(x => !Number.isFinite(x.value) || x.value < 0 || x.value > 1000000)) {
      notify("Rule thresholds must be valid non-negative numbers.", true);
      return;
    }
    const ruleWeights = { ...(c.ruleWeights || {}) };
    for (const input of root.querySelectorAll("[data-rule-points]")) {
      const value = Number(input.value);
      if (!Number.isFinite(value) || value < 0 || value > 100) {
        notify("Each evaluation check needs points between 0 and 100.", true);
        return;
      }
      ruleWeights[input.dataset.rulePoints] = value;
    }
    const currentRules = state.rubric.rules.deterministic || [];
    state.rubric.rules.deterministic = currentRules.map(rule =>
      editedRules.find(x => x.id === rule.id) || rule
    );
    const greeting = state.rubric.rules.deterministic.find(x => x.id === "greeting_time");
    const fallback = state.rubric.rules.deterministic.find(x => x.id === "fallback_greeting");
    if (greeting) state.rubric.rules.greet7 = greeting.value;
    if (fallback) state.rubric.rules.greet10 = fallback.value;
    Object.assign(c, {
      name,
      definition,
      instructions,
      weight,
      checkpoints: newCheckpoints,
      ruleWeights
    });

    save(
      "Parameter saved. New evaluations " +
      "will use this rubric revision."
    );
    return;
  }

  /**
   * Save deterministic rules.
   */
  if (button.id === "saveRules") {
    const entries = [...root.querySelectorAll("[data-rule-value]")];
    const deterministic = entries.map(input => ({
      id: input.dataset.ruleValue,
      value: input.value.trim() === "" ? NaN : Number(input.value),
      enabled: !!root.querySelector('[data-rule-enabled="' + input.dataset.ruleValue + '"]')?.checked
    }));
    if (deterministic.some(x => !Number.isFinite(x.value) || x.value < 0 || x.value > 1000000)) {
      notify("Enter a valid non-negative numeric threshold for every rule.", true);
      return;
    }
    const first = deterministic.find(x => x.id === "greeting_time");
    const fallback = deterministic.find(x => x.id === "fallback_greeting");
    if (!Number.isInteger(first.value) || !Number.isInteger(fallback.value) ||
        first.value > 60 || fallback.value > 60 || fallback.value < first.value) {
      notify("Greeting thresholds must be whole seconds between 0 and 60; fallback cannot be shorter.", true);
      return;
    }
    state.rubric.rules.deterministic = deterministic;
    state.rubric.rules.greet7 = first.value;
    state.rubric.rules.greet10 = fallback.value;
    state.rubric.rules.greetingTerms = $("#rTerms").value
      .split(/\r?\n/).map(x => x.trim()).filter(Boolean);
    save("Deterministic rules saved. Only connected rules are executed; pending rules do not change scoring.");
    return;
  }

  /**
   * Save evaluator instructions and model.
   */
  if (button.id === "saveModel") {
    const value = $("#global").value.trim();

    if (
      !value ||
      value.length > 5000
    ) {
      notify(
        "Instructions must be 1–5000 characters.",
        true
      );
      return;
    }

    state.rubric.instructions = value;
    state.rubric.model =
      $("#model").value;

    save(
      "Evaluator model and instructions saved."
    );
  }
});

/**
 * File upload and criterion enable/disable.
 */
root.addEventListener(
  "change",
  async event => {
    const target = event.target;

    if (target.id === "file") {
      const file = target.files?.[0];

      if (!file) return;

      if (file.size > 8 * 1024 * 1024) {
        notify(
          "Maximum file size is 8 MB.",
          true
        );
        return;
      }

      try {
        load(
          await file.text(),
          file.name
        );
      } catch (err) {
        state.importFeedback = "Import failed: " + String(err.message || err);
        const label = root.querySelector("#import-feedback");
        if (label) label.textContent = state.importFeedback;
        notify(state.importFeedback, true);
      }

      return;
    }

    if (target.id === "report-period") { state.period.mode = target.value; render(); return; }
    if (target.id === "period-from" || target.id === "period-to") {
      state.period[target.id === "period-from" ? "from" : "to"] = target.value; render(); return;
    }
    if (target.id === "overview-agent-filter") {
      state.overviewAgent = target.value;
      render();
      return;
    }

    if (target.id === "filter") {
      state.agentFilter = target.value;
      filterRows();
      return;
    }

    if (target.dataset.enabled) {
      const c = state.rubric.criteria.find(
        x => x.id === target.dataset.enabled
      );

      if (c) {
        c.enabled = target.checked;
        // Parent criterion is the master activation control. Preserve each
        // subordinate rule's saved selection when the parent is disabled.
        if (target.checked) {
          const ids = linkedRules(c.id);
          const rules = state.rubric.rules.deterministic || [];
          if (ids.length && !rules.some(r => ids.includes(r.id) && r.enabled)) {
            const first = rules.find(r => ids.includes(r.id));
            if (first) first.enabled = true;
          }
        }

        save(
          "Parameter enable/disable saved."
        );
      }
    }
  }
);

/**
 * Live queue search.
 */
root.addEventListener("input", event => {
  if (event.target.id === "paste") {
    state.pasteDraft = event.target.value;
  }
  if (event.target.id === "search") {
    state.search = event.target.value;
    filterRows();
  }
});

render();

// Load browser-local results after refresh.
void loadHistory().then(calls => {
  const restored = calls.map(c => c.status === "RUNNING" ? { ...c, status: "READY" } : c);
  // Never overwrite a fresh upload if IndexedDB hydration finishes later.
  // A fresh import is authoritative; late IndexedDB hydration must never
  // replace its selected interaction, status, or transcript.
  state.calls = state.calls.length ? mergeImported(restored, state.calls).calls : restored;
  state.selected = state.selected && state.calls.some(c => c.key === state.selected)
    ? state.selected : state.calls[0]?.key || null;
  render();
}).catch(e => notify("Local history unavailable: " + e.message, true));
