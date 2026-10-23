import test from "node:test";
import assert from "node:assert/strict";
import { defaultRubric } from "../public/js/config.js";
import { configuration, studio } from "../public/js/ui.js";

test("QA Configurator has a collapsed state and no editor after closing a parameter", () => {
  const rubric = defaultRubric();
  const id = rubric.criteria[0].id;
  const expanded = configuration(rubric, id);
  assert.match(expanded, /aria-expanded="true"/);
  assert.match(expanded, /id="cName"/);
  const collapsed = configuration(rubric, null);
  assert.doesNotMatch(collapsed, /aria-expanded="true"/);
  assert.doesNotMatch(collapsed, /id="cName"/);
  assert.match(collapsed, /aria-expanded="false"/);
});

test("Stop-after-current provides a visible locked state and keeps progress", () => {
  const rubric = defaultRubric();
  const call = { key: "check:1", id: "check:1", agent: "Sample Agent", status: "READY",
    turns: [], findings: [], score: null, duration: "00:15" };
  const html = studio({
    calls: [call], selected: call.key, running: true, stopAfterCurrent: true,
    phase: "ai", message: "Stop requested — finishing current interaction",
    search: "", agentFilter: "", rubric
  });
  assert.match(html, /Stop requested/);
  assert.match(html, /No more interactions will start/);
  assert.match(html, /id="stopAfter"[^>]*disabled/);
});

test("Paused batch explicitly offers to resume pending interactions", () => {
  const rubric = defaultRubric();
  const call = { key: "check:2", id: "check:2", agent: "Sample Agent", status: "READY",
    turns: [], findings: [], score: null, duration: "00:15" };
  const html = studio({
    calls: [call], selected: call.key, running: false, stopAfterCurrent: false,
    phase: "idle", message: "Stopped — completed results retained",
    search: "", agentFilter: "", rubric
  });
  assert.match(html, /Resume pending/);
  assert.match(html, /Stopped · 1 pending/);
});
