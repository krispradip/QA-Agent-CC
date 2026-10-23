import test from "node:test";
import assert from "node:assert/strict";
import { defaultRubric, linkedRules, setCriterionEnabled, enforceParentSelection, saveRubric, loadRubric } from "../public/js/config.js";
import { configuration } from "../public/js/ui.js";
import { assess } from "../public/js/engine.js";

const parent=(rubric,id)=>rubric.criteria.find(c=>c.id===id);
const owned=(rubric,id)=>rubric.rules.deterministic.filter(r=>linkedRules(id).includes(r.id));
const call=()=>({id:"sample",key:"sample",agent:"Demo Agent",turns:[
  {line:1,speaker:"agent",text:"Hello, thanks for calling.",timestamp:"00:05",seconds:5},
  {line:2,speaker:"customer",text:"Hi",timestamp:"00:08",seconds:8}
],findings:[],score:null,status:"READY"});

test("Parent checkbox enables and disables every qualitative child together",()=>{
  const rubric=defaultRubric();
  assert.equal(parent(rubric,"pace").checkpoints.length,2);
  setCriterionEnabled(rubric,"pace",false);
  assert.equal(parent(rubric,"pace").enabled,false);
  assert.ok(parent(rubric,"pace").checkpoints.every(x=>x.enabled===false));
  let html=configuration(rubric,"pace");
  assert.match(html,/data-anchor-enabled="0"\s*>/);
  assert.match(html,/data-anchor-enabled="1"\s*>/);
  setCriterionEnabled(rubric,"pace",true);
  assert.equal(parent(rubric,"pace").enabled,true);
  assert.ok(parent(rubric,"pace").checkpoints.every(x=>x.enabled===true));
  html=configuration(rubric,"pace");
  assert.match(html,/data-anchor-enabled="0" checked/);
  assert.match(html,/data-anchor-enabled="1" checked/);
});

test("Parent toggle also controls linked quantitative checks",()=>{
  const rubric=defaultRubric();
  setCriterionEnabled(rubric,"opening",false);
  assert.ok(parent(rubric,"opening").checkpoints.every(x=>x.enabled===false));
  assert.ok(owned(rubric,"opening").every(r=>r.enabled===false));
  setCriterionEnabled(rubric,"opening",true);
  assert.ok(parent(rubric,"opening").checkpoints.every(x=>x.enabled===true));
  assert.ok(owned(rubric,"opening").every(r=>r.enabled===true));
});

test("Saving a legacy parent-disabled rubric removes stale active children",()=>{
  const rubric=defaultRubric();
  parent(rubric,"pace").enabled=false;
  parent(rubric,"pace").checkpoints[0].enabled=true;
  parent(rubric,"opening").enabled=false;
  owned(rubric,"opening")[0].enabled=true;
  enforceParentSelection(rubric);
  assert.ok(parent(rubric,"pace").checkpoints.every(x=>!x.enabled));
  assert.ok(owned(rubric,"opening").every(r=>!r.enabled));
  setCriterionEnabled(rubric,"pace",true);
  parent(rubric,"pace").checkpoints[1].enabled=false;
  enforceParentSelection(rubric);
  assert.equal(parent(rubric,"pace").checkpoints[0].enabled,true);
  assert.equal(parent(rubric,"pace").checkpoints[1].enabled,false);
});

test("Disabled parents are not assessed even when an unsanitized child is enabled",async()=>{
  const rubric=defaultRubric();
  for(const c of rubric.criteria) setCriterionEnabled(rubric,c.id,false);
  parent(rubric,"pace").checkpoints[0].enabled=true; // stale legacy data
  const sample=call();
  await assess(sample,rubric,new AbortController().signal,()=>{});
  assert.equal(sample.status,"COMPLETE");
  assert.deepEqual(sample.findings,[]);
  assert.deepEqual(sample.meta.criteria,[]);
});

test("Re-enabling a quantitative parent includes its rule on the next assessment",async()=>{
  const rubric=defaultRubric();
  for(const c of rubric.criteria) setCriterionEnabled(rubric,c.id,false);
  setCriterionEnabled(rubric,"greet7",true);
  const sample=call();
  await assess(sample,rubric,new AbortController().signal,()=>{});
  assert.deepEqual(sample.meta.criteria.map(c=>c.id),["greet7"]);
  assert.equal(sample.findings[0].anchors[0].state,"MET");
});

test("Individual qualitative check selection is respected in Gemini payload",async()=>{
  const rubric=defaultRubric();
  for(const c of rubric.criteria) setCriterionEnabled(rubric,c.id,false);
  setCriterionEnabled(rubric,"pace",true);
  parent(rubric,"pace").checkpoints[1].enabled=false;
  let payload;
  const priorFetch=globalThis.fetch;
  globalThis.fetch=async (_url,options)=>{
    payload=JSON.parse(options.body);
    return {ok:true,json:async()=>({findings:[]})};
  };
  try{
    const sample=call();
    await assess(sample,rubric,new AbortController().signal,()=>{});
    assert.deepEqual(payload.criteria.map(c=>c.id),["pace"]);
    assert.deepEqual(payload.criteria[0].checkpoints.map(c=>c.id),["pace-1"]);
    assert.equal(sample.meta.criteria[0].checkpoints[1].enabled,false);
  } finally {globalThis.fetch=priorFetch;}
});

test("Save then reload persists the parent and both child checkbox states",()=>{
  const existing=globalThis.localStorage;
  const store=new Map();
  globalThis.localStorage={
    getItem:key=>store.get(key)||null,
    setItem:(key,value)=>store.set(key,value)
  };
  try{
    const rubric=defaultRubric();
    setCriterionEnabled(rubric,"pace",false);
    saveRubric(rubric);
    const loaded=loadRubric();
    assert.equal(parent(loaded,"pace").enabled,false);
    assert.deepEqual(parent(loaded,"pace").checkpoints.map(a=>a.enabled),[false,false]);
    setCriterionEnabled(loaded,"pace",true);
    saveRubric(loaded);
    const restored=loadRubric();
    assert.equal(parent(restored,"pace").enabled,true);
    assert.deepEqual(parent(restored,"pace").checkpoints.map(a=>a.enabled),[true,true]);
  } finally {globalThis.localStorage=existing;}
});
