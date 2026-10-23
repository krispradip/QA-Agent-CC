import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {scrollPageToTop} from "../public/js/navigation.js";

test("Agent/report navigation resets both document and main scroll positions",()=>{
  const calls=[];
  const main={scrollTop:780};
  const doc={
    scrollingElement:{scrollTop:690},
    querySelector(selector){return selector===".main"?main:null;}
  };
  const win={scrollTo(x,y){calls.push([x,y]);}};
  scrollPageToTop(win,doc);
  assert.deepEqual(calls,[[0,0]]);
  assert.equal(doc.scrollingElement.scrollTop,0);
  assert.equal(main.scrollTop,0);
});

test("Scroll reset supports a missing nested viewport",()=>{
  const called=[];
  scrollPageToTop({scrollTo(...args){called.push(args);}},
    {scrollingElement:null,querySelector(){return null;}});
  assert.deepEqual(called,[[0,0]]);
});

test("Both Open Agents & Reports and Inspect assessment invoke top-resetting navigation",()=>{
  const app=readFileSync(new URL("../public/js/app.js",import.meta.url),"utf8");
  assert.match(app,/function navigate\(page\)\s*\{[\s\S]*?state\.page = page;\s*render\(\);\s*scrollPageToTop\(window, document\);/);
  assert.match(app,/if \(button\.dataset\.pageGo\)\s*\{\s*navigate\(button\.dataset\.pageGo\)/);
  assert.match(app,/if \(button\.dataset\.open\)\s*\{[\s\S]*?navigate\("agents"\)/);
  assert.match(app,/state\.importFeedback = "";/);
  assert.doesNotMatch(app,/Select Evaluate to start assessment/);
});
