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
  saveRubric
} from "./config.js";

import {
  parseExport,
  mapSpeakers,
  SAMPLE
} from "./parser.js";

import {
  assess
} from "./engine.js";

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
  search: "",

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
      ? overview(state.calls, state.rubric, state.overviewAgent)

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
  if (state.running) return;

  state.calls = parseExport(
    text,
    filename
  );

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

  state.selected =
    state.calls.find(c =>
      c.status === "READY"
    )?.key ||
    state.calls[0].key;

  state.agentFilter = "";
  state.overviewAgent = "";
  state.search = "";
  state.phase = "idle";

  const ready = state.calls.filter(
    c => c.status === "READY"
  ).length;

  state.message =
    `${state.calls.length} records identified · ` +
    `${ready} ready`;

  notify(
    "Export parsed. Click Evaluate selected " +
    "to run a live AI assessment."
  );

  render();
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
        ["READY", "ERROR"].includes(c.status)
      );

  if (!target.length) return;

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
      load(
        $("#paste").value,
        "paste.txt"
      );
    } catch (err) {
      notify(err.message, true);
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

    if (c.mode === "ai") {
      const lines = $("#cAnchors").value
        .split(/\r?\n/)
        .map(x => x.trim())
        .filter(Boolean);

      if (
        lines.length < 1 ||
        lines.length > 6 ||
        lines.some(x => x.length > 250)
      ) {
        notify(
          "Use between one and six short checkpoints, one per line.",
          true
        );
        return;
      }

      newCheckpoints = lines.map(
        (text, i) => ({
          id: `${c.id}-${i + 1}`,
          text
        })
      );
    }

    Object.assign(c, {
      name,
      definition,
      instructions,
      weight,
      checkpoints: newCheckpoints
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
    const x = Number(
      $("#rGreet7").value
    );

    const y = Number(
      $("#rGreet10").value
    );

    if (
      !Number.isInteger(x) ||
      !Number.isInteger(y) ||
      x < 0 ||
      x > 60 ||
      y < x ||
      y > 60
    ) {
      notify(
        "Invalid greeting timing thresholds.",
        true
      );
      return;
    }

    state.rubric.rules.greet7 = x;
    state.rubric.rules.greet10 = y;

    state.rubric.rules.greetingTerms =
      $("#rTerms").value
        .split(/\r?\n/)
        .map(x => x.trim())
        .filter(Boolean);

    save("Rules saved.");
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
        notify(err.message, true);
      }

      return;
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
  if (event.target.id === "search") {
    state.search = event.target.value;
    filterRows();
  }
});

render();
