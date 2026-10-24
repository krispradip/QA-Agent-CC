import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {defaultRubric} from "../public/js/config.js";
import {studio} from "../public/js/ui.js";
import {
  PROGRESS_KEY,readProgress,saveProgress,clearProgress,progressLabels
} from "../public/js/progress.js";

const start=1700000000000;
const completed={
  started:start,ended:start+83500,
  total:1,completed:1,callCount:1,outcome:"complete"
};

function mockStorage(){
  const items=new Map();
  return {
    getItem:k=>items.get(k)||null,
    setItem:(k,v)=>items.set(k,v),
    removeItem:k=>items.delete(k),
    items
  };
}

test("Finished evaluation freezes actual elapsed time and never shows calculating ETA",()=>{
  const a=progressLabels(completed,{now:start+1200000,callCount:1,handled:1});
  assert.deepEqual(a,{elapsed:"01:23",eta:"Complete",count:"1 / 1 processed"});
  const later=progressLabels(completed,{now:start+3600000,callCount:1,handled:1});
  assert.deepEqual(later,a);
});

test("Running evaluation shows real elapsed time; ETA is calculated only after a result",()=>{
  const p={started:start,total:2,completed:0,callCount:2};
  const first=progressLabels(p,{now:start+20000,callCount:2,handled:0});
  assert.deepEqual(first,{elapsed:"00:20",eta:"Calculating…",count:"0 / 2 processed"});
  const second=progressLabels({...p,completed:1},{now:start+30000,callCount:2,handled:1});
  assert.deepEqual(second,{elapsed:"00:30",eta:"~00:30",count:"1 / 2 processed"});
});

test("Initial and legacy restored assessments never show fictitious 00:00 or Calculating",()=>{
  const noRun=progressLabels(undefined,{callCount:1,handled:1});
  assert.deepEqual(noRun,{elapsed:"—",eta:"—",count:"1 / 1 processed"});
  const stale=progressLabels(completed,{callCount:2,handled:2});
  assert.deepEqual(stale,{elapsed:"—",eta:"—",count:"2 / 2 processed"});
});

test("Stopped and quota-interrupted evaluations have terminal ETA labels",()=>{
  assert.equal(progressLabels({...completed,outcome:"stopped",completed:0},{callCount:1,handled:0}).eta,"Stopped");
  assert.equal(progressLabels({...completed,outcome:"quota",completed:0},{callCount:1,handled:0}).eta,"Interrupted");
});

test("Non-sensitive end-of-run timing survives refresh and can be cleared",()=>{
  const storage=mockStorage();
  assert.equal(readProgress(storage),null);
  assert.equal(saveProgress(storage,completed),true);
  assert.deepEqual(readProgress(storage),completed);
  assert.ok(storage.items.get(PROGRESS_KEY).includes('"elapsed"')===false);
  assert.equal(saveProgress(storage,{...completed,ended:start-2}),false);
  assert.deepEqual(readProgress(storage),completed);
  clearProgress(storage);
  assert.equal(readProgress(storage),null);
});

test("Studio renders last elapsed time and Completed ETA after browser hydration",()=>{
  const call={key:"a",id:"a",agent:"A",status:"COMPLETE",score:{score:100,coverage:100},
    findings:[],duration:"00:15"};
  const html=studio({calls:[call],selected:"a",running:false,
    phase:"idle",message:"",search:"",agentFilter:"",rubric:defaultRubric(),
    evalProgress:completed});
  assert.match(html,/id="qa-elapsed">01:23<\/strong>/);
  assert.match(html,/id="qa-eta">Complete<\/strong>/);
  assert.match(html,/id="qa-batch-count">1 \/ 1 processed<\/span>/);
  const old=studio({calls:[call],selected:"a",running:false,
    phase:"idle",message:"",search:"",agentFilter:"",rubric:defaultRubric()});
  assert.match(old,/id="qa-elapsed">—<\/strong>/);
  assert.match(old,/id="qa-eta">—<\/strong>/);
});

test("Controller persists terminal progress, resets on import, and clears on history deletion",()=>{
  const src=readFileSync(new URL("../public/js/app.js",import.meta.url),"utf8");
  assert.match(src,/state\.evalProgress\.ended=Date\.now\(\)/);
  assert.match(src,/saveProgress\([^;]*state\.evalProgress\)/);
  assert.match(src,/merged\.added > 0[\s\S]{0,250}clearProgress/);
  assert.match(src,/clearBatch[\s\S]*?clearProgress/);
});
