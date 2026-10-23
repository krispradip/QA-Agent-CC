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

test("Evaluation Studio keeps assessment actions within each conversation and removes workflow panel", () => {
  const rubric=defaultRubric();
  const calls=[
    {key:"interaction:complete",id:"interaction-complete",agent:"Hassan Aly1",
      status:"COMPLETE",duration:"15:03",findings:[{id:"opening",status:"SCORED",score:75}],
      score:{score:75,coverage:100}},
    {key:"interaction:pending",id:"interaction-pending",agent:"Mohamed El Ekwary",
      status:"READY",duration:"04:16",findings:[],score:null}
  ];
  const html=studio({
    calls,selected:calls[0].key,running:false,stopAfterCurrent:false,
    phase:"idle",message:"",search:"",agentFilter:"",rubric
  });
  assert.doesNotMatch(html,/ASSESSMENT WORKFLOW|studio-results|id="call-detail"/);
  const queue=html.match(/<div class="studio-queue-row">([\s\S]*?)<div class="studio-hint-row">/)?.[1]||"";
  assert.ok(queue,"Conversations panel must exist");
  assert.match(queue,/0 duplicates\s*· 0 errors/);
  assert.match(queue,/<button[^>]+data-page-go="agents"[^>]*>Open Agents &amp; Reports/);
  assert.match(queue,/data-open="interaction:complete"/);
  assert.match(queue,/data-open="interaction:pending"/);
  const completeButton=queue.match(/<button[^>]+data-open="interaction:complete"[^>]*>/)?.[0]||"";
  const pendingButton=queue.match(/<button[^>]+data-open="interaction:pending"[^>]*>/)?.[0]||"";
  assert.doesNotMatch(completeButton,/disabled/);
  assert.match(pendingButton,/disabled/);
  assert.equal((html.match(/data-page-go="agents"/g)||[]).length,1);
});
