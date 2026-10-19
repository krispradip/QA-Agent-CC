
/**
 * QA-APP-001
 * Purpose: Navigation, upload, batch execution and settings.
 * Depends on: store.js, parser.js, engine.js, views.js.
 * Impact: All application workflows.
 * Version: 2.0
 */

import {
  getConfig, saveConfig
} from "./core/store.js";

import {
  parseExport
} from "./services/parser.js";

import {
  evaluateCall
} from "./core/engine.js";

import {
  overview, evaluation, configuration, refreshDetail
} from "./ui/views.js";

let cfg = getConfig();
let calls = [];
let page = "dashboard";
let selected = null;
let group = null;
let criterion = null;
let running = false;
let abort = null;
let stage = "idle";
let message = "Ready to assess";

const root = document.querySelector("#view");
const $ = s => document.querySelector(s);

/**
 * QA-APP-NAV-001
 * Purpose: Render screens and attach screen-level interactions.
 */
function render() {
  document.querySelectorAll("#nav button").forEach(b =>
    b.classList.toggle("selected", b.dataset.page === page)
  );

  const titles = {
    dashboard: [
      "QA Overview",
      "Quality intelligence across evaluated interactions"
    ],
    evaluation: [
      "AI Evaluation Studio",
      "Upload a Genesys export and assess each call independently"
    ],
    configuration: [
      "QA Configuration",
      "Editable SHARE standards, rules and AI evaluator behaviour"
    ]
  };

  $("#pageTitle").textContent = titles[page][0];
  $("#pageSub").textContent = titles[page][1];

  root.innerHTML =
    page === "dashboard"
      ? overview(calls)
      : page === "evaluation"
        ? evaluation(calls, selected, stage, message)
        : configuration(cfg, group || undefined, criterion);

  bind();
}

/**
 * QA-APP-EVENT-001
 * Purpose: Connect all active screen controls.
 */
function bind() {
  root.querySelectorAll(
    "[data-action=go-evaluation]"
  ).forEach(b => {
    b.onclick = () => {
      page = "evaluation";
      render();
    };
  });

  if (page === "evaluation") {
    const input = $("#upload");

    input.onchange = async () => {
      if (running) return;

      const f = input.files?.[0];
      if (!f) return;

      if (
        f.size > 8 * 1024 * 1024 ||
        !/\.(txt|tsv)$/i.test(f.name)
      ) {
        alert("Upload a TXT/TSV export under 8 MB");
        return;
      }

      try {
        calls = parseExport(await f.text());
        selected = calls[0]?.key || null;
        stage = "idle";
        message =
          `${calls.filter(c => c.status === "READY").length} interactions ready`;
        render();
      } catch (e) {
        alert(e.message);
      }
    };

    root.querySelectorAll("[data-id]").forEach(row => {
      row.onclick = () => {
        selected = row.dataset.id;
        render();
      };
    });

    $("#export").onclick = () => {
      const blob = new Blob(
        [JSON.stringify({
          configVersion: cfg.version,
          evaluatedAt: new Date().toISOString(),
          calls
        }, null, 2)],
        { type: "application/json" }
      );

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");

      a.href = url;
      a.download = "qualis-qa-results.json";
      a.click();

      setTimeout(() => URL.revokeObjectURL(url), 1000);
    };

    $("#stop").onclick = () => abort?.abort();
    $("#start").onclick = runBatch;
  }

  if (page === "configuration") {
    root.querySelectorAll("[data-group]").forEach(b => {
      b.onclick = () => {
        group = b.dataset.group;
        criterion = null;
        render();
      };
    });

    root.querySelectorAll("[data-criterion]").forEach(b => {
      b.onclick = () => {
        criterion = b.dataset.criterion;
        render();
      };
    });

    // Individual criterion enable/disable controls.
    root.querySelectorAll("[data-toggle]").forEach(el => {
      el.onchange = () => {
        const c = cfg.criteria.find(
          x => x.id === el.dataset.toggle
        );

        c.enabled = el.checked;
        cfg.version++;

        saveConfig(cfg);
        render();
      };
    });

    // Save the selected parameter.
    $("#saveParameter").onclick = () => {
      const c = cfg.criteria.find(x =>
        x.id === (
          criterion ||
          cfg.criteria.find(x =>
            x.group === (group || cfg.criteria[0].group)
          ).id
        )
      );

      const weight = Number($("#cWeight").value);

      if (
        !Number.isFinite(weight) ||
        weight < 0 ||
        weight > 100 ||
        !$("#cName").value.trim()
      ) {
        alert("Check name and weight");
        return;
      }

      Object.assign(c, {
        name: $("#cName").value.trim(),
        definition: $("#cDefinition").value.trim(),
        guidance: $("#cGuidance").value.trim(),
        aiInstructions: $("#cAI").value.trim(),
        weight
      });

      cfg.version++;
      saveConfig(cfg);

      $("#saveMsg").textContent = "Saved";
    };

    // Save deterministic rule settings.
    $("#saveRules").onclick = () => {
      const x = +$("#rGreeting").value;
      const y = +$("#rFallback").value;

      if (
        !Number.isInteger(x) ||
        !Number.isInteger(y) ||
        x < 0 ||
        y < x ||
        y > 60
      ) {
        alert("Invalid greeting thresholds");
        return;
      }

      cfg.rules.greeting7 = x;
      cfg.rules.greeting10 = y;

      root.querySelectorAll("[data-rule]").forEach(el => {
        cfg.rules[el.dataset.rule] = el.value
          .split(/\r?\n/)
          .map(s => s.trim())
          .filter(Boolean);
      });

      cfg.version++;
      saveConfig(cfg);
      alert("Rules saved");
    };

    // Save model selection and AI instructions.
    $("#saveAI").onclick = () => {
      cfg.model = $("#model").value;
      cfg.instructions = $("#instructions").value.trim();

      if (!cfg.instructions) {
        return alert("Instructions required");
      }

      cfg.version++;
      saveConfig(cfg);
      alert("AI settings saved");
    };
  }
}

/**
 * QA-APP-BATCH-001
 * Purpose: Evaluate each call sequentially with real progress.
 * Safeguards: Handle cancellation, failures and Gemini rate limits.
 */
async function runBatch() {
  if (running) return;

  running = true;
  abort = new AbortController();

  const pending = calls.filter(c => c.status === "READY");

  try {
    for (const call of pending) {
      if (abort.signal.aborted) break;

      selected = call.key;
      stage = "working";
      message = `Evaluating ${call.agent}`;

      render();

      $("#stop").disabled = false;
      $("#upload").disabled = true;

      try {
        await evaluateCall(
          call,
          cfg,
          s => {
            stage = "working";

            message = ({
              rules: "Applying objective rules",
              ai: "Gemini analysing dialogue",
              validating: "Validating transcript evidence",
              complete: "Interaction complete"
            })[s] || s;

            const detail = $("#detail");

            if (detail) refreshDetail(call);

            const text = $("#aiStage");
            if (text) text.textContent = message;
          },
          abort.signal
        );
      } catch (e) {
        if (abort.signal.aborted) {
          call.status = "READY";
          break;
        }

        call.status = "ERROR";
        call.error = e.message;
        stage = "error";
        message = e.message;

        render();

        if (e.status === 429) {
          message = "Gemini quota reached; batch paused";
          break;
        }
      }

      render();

      $("#stop").disabled = false;
      $("#upload").disabled = true;
    }

    stage = "complete";
    message =
      `${calls.filter(c => c.status === "COMPLETE").length} interactions evaluated`;

  } finally {
    running = false;
    abort = null;
    render();
  }
}

document.querySelectorAll("#nav button").forEach(b => {
  b.onclick = () => {
    if (running) return;

    page = b.dataset.page;
    render();
  };
});

render();
