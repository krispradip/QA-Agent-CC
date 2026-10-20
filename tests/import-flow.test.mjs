/**
 * QA-IMPORT-REGRESSION-001
 * Tests saved transcript reimport, re-evaluation availability,
 * visible intake feedback and controller events without customer data.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { parseExport, SAMPLE } from "../public/js/parser.js";
import { mergeImported } from "../public/js/history.js";
import { studio } from "../public/js/ui.js";
import { defaultRubric } from "../public/js/config.js";

const rubric = defaultRubric();
const makeState = (calls, selected, feedback = "") => ({
  calls, selected, importFeedback: feedback,
  running: false, phase: "idle", message: "",
  agentFilter: "", search: "", rubric
});

test("first import is selectable and enables Evaluate selected", () => {
  const parsed = parseExport(SAMPLE, "demo.txt");
  const { calls, added } = mergeImported([], parsed);
  assert.equal(added, 1);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].status, "READY");
  const html = studio(makeState(calls, calls[0].key, "1 new"));
  assert.match(html, /id="import-feedback"/);
  assert.match(html, /1 new/);
  assert.match(html, /Evaluate selected/);
  assert.doesNotMatch(html, /id="one"\s+disabled/);
});

test("reimport of an assessed call keeps its original result and enables Re-evaluate", () => {
  const { calls } = mergeImported([], parseExport(SAMPLE, "demo.txt"));
  calls[0].status = "COMPLETE";
  calls[0].score = { score: 93, coverage: 56 };
  const incoming = parseExport(SAMPLE, "demo.txt");
  const merge = mergeImported(calls, incoming);
  assert.equal(merge.added, 0);
  assert.equal(merge.alreadyKnown, 1);
  assert.equal(merge.calls[0].status, "COMPLETE");
  assert.equal(merge.calls[0].score.score, 93);
  const html = studio(makeState(merge.calls, incoming[0].key));
  assert.match(html, /Re-evaluate selected/);
  assert.doesNotMatch(html, /id="one"\s+disabled/);
});

test("newly pasted speaker-labelled transcript is recognized", () => {
  const parsed = parseExport("Agent: Hello, how can I help?\nCustomer: I need assistance with points.", "paste.txt");
  const { calls } = mergeImported([], parsed);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].status, "READY");
});

test("bad paste explains formatting instead of silently creating no call", () => {
  assert.throws(() => parseExport("Unlabelled conversation with no speaker turns", "paste.txt"),
    /No recognizable dialogue/);
});

test("real app controller handles paste and shows an enabled Evaluate selected button", async () => {
  const elements = {};
  function element(name) {
    return elements[name] ||= {
      textContent: "", className: "", value: "", innerHTML: "",
      listeners: {}, dataset: {},
      addEventListener(kind, fn) { this.listeners[kind] = fn; },
      querySelectorAll() { return []; },
      querySelector(sel) { return elements[sel] || null; },
    };
  }
  const root = element("#view");
  element("#notice");
  element("#page-title");
  element("#page-sub");
  element("#nav");
  element("#paste").value = "Agent: Hello, welcome to SHARE.\nCustomer: Hi, I need help.";
  globalThis.document = {
    querySelector: element, querySelectorAll: () => []
  };
  globalThis.localStorage = {
    getItem: () => null, setItem: () => {}
  };
  globalThis.indexedDB = undefined;
  await import("../public/js/app.js");
  const click = button => root.listeners.click({
    target: { closest: () => ({ dataset: {}, ...button }) }
  });
  click({ id: "pasteLoad" });
  assert.match(root.innerHTML, /id="one"[^>]*>\s*Evaluate selected/);
  assert.match(root.innerHTML, /1 new/);
  assert.match(root.innerHTML, /AGENT\s*\/\s*INTERACTION/);
  assert.match(element("#notice").textContent, /1 new/);
  // Reimport is not a no-op: the same record stays available for selection.
  element("#paste").value = "Agent: Hello, welcome to SHARE.\nCustomer: Hi, I need help.";
  click({ id: "pasteLoad" });
  assert.match(root.innerHTML, /1 existing/);
});
