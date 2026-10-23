import test from "node:test";
import assert from "node:assert/strict";
import { executeRule } from "../public/js/engine.js";

const rule = {id:"greeting_time",value:7};
const def = {id:"greeting_time",name:"Greeting within 7 seconds"};
const rules = {greetingTerms:["شكرا لاتصالك","hello","good morning"]};
const run = (text, seconds, timestamp="00:06") =>
  executeRule({turns:[{speaker:"customer",line:1,text:"مرحبا",seconds:5,timestamp:"00:05"},
    {speaker:"agent",line:2,text,seconds,timestamp}]},def,rule,rules);

test("Arabic ASR greeting at 6 seconds is MET",()=>{
 const x=run("شكراً لاتصالك مع سنتر زيادة أساعدك",6);
 assert.equal(x.state,"MET");
 assert.equal(x.evidence[0].line,2);
});
test("Arabic greeting at 8 seconds is MISSED",()=>{
 assert.equal(run("شكرا لاتصالك",8,"00:08").state,"MISSED");
});
test("Timestamp-only greeting at 7 seconds is MET",()=>{
 assert.equal(run("شكراً لاتصالك",null,"00:07").state,"MET");
});
test("Missing timing remains UNKNOWN",()=>{
 assert.equal(run("شكراً لاتصالك",null,"").state,"UNKNOWN");
});
test("No actual agent greeting is UNKNOWN",()=>{
 assert.equal(run("أراجع حسابك الآن",6).state,"UNKNOWN");
});
test("English greeting at 6 seconds is MET",()=>{
 assert.equal(run("Good morning, how may I help?",6).state,"MET");
});
