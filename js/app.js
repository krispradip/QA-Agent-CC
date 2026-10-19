
/**
 * @component QA-APP-001
 * @purpose Application orchestration and event handling.
 * @dependsOn core/evaluation.js, ui/workspace.js
 * @changeImpact Evaluation workflow, navigation, user interactions.
 * @version 1.0
 */

import {
  loadConfig, saveConfig, parseTranscript, runRules
} from "./core/evaluation.js";

import {
  SAMPLE, renderWorkspace, renderSettings,
  setAgentState, showTranscript, showResults
} from "./ui/workspace.js";

let config=loadConfig();
let currentPage="evaluate";
let running=false;

const view=document.getElementById("appView");

function navigate(page) {
  if (running) return;
  currentPage=page;

  document.querySelectorAll(".nav-link").forEach(el=>{
    el.classList.toggle("active",el.dataset.page===page);
  });

  document.getElementById("pageTitle").textContent=
    page==="evaluate"?"Interaction Evaluation":"QA Configuration";

  view.innerHTML=page==="evaluate"
    ? renderWorkspace()
    : renderSettings(config);

  if (page==="evaluate") bindWorkspace();
  else bindSettings();
}

document.querySelectorAll(".nav-link").forEach(el=>{
  el.addEventListener("click",()=>navigate(el.dataset.page));
});

/**
 * @component QA-UPLOAD-001
 * @purpose Read TXT/CSV/JSON transcript files.
 * @limitation CSV expects speaker/text and optional timestamp columns.
 * @changeImpact Uploaded interaction compatibility.
 */
async function readUpload(file) {
  if (file.size>2*1024*1024) {
    throw Error("Maximum transcript file size is 2 MB.");
  }

  const text=await file.text();
  const extension=file.name.split(".").pop().toLowerCase();

  if (extension==="txt") return text;

  if (extension==="json") {
    const parsed=JSON.parse(text);
    const turns=Array.isArray(parsed)?parsed:parsed.turns;
    if (!Array.isArray(turns))
      throw Error("JSON requires an array or a turns array.");
    return turns.map(t=>{
      const speaker=String(t.speaker||"").toLowerCase();
      if (!["agent","customer"].includes(speaker)) return "";
      const time=t.timestamp?`[${t.timestamp}] `:"";
      return `${time}${speaker}: ${t.text||""}`;
    }).filter(Boolean).join("\n");
  }

  if (extension==="csv") {
    const records=parseCSV(text);
    const headers=records.shift().map(h=>h.trim().toLowerCase());
    const si=headers.indexOf("speaker");
    const ti=headers.indexOf("text");
    const ts=headers.indexOf("timestamp");
    if (si<0||ti<0)
      throw Error("CSV requires speaker and text columns.");
    return records.map(r=>{
      const speaker=(r[si]||"").trim().toLowerCase();
      if (!["agent","customer"].includes(speaker)) return "";
      return `${ts>=0&&r[ts]?`[${r[ts]}] `:""}`+
        `${speaker}: ${r[ti]||""}`;
    }).filter(Boolean).join("\n");
  }

  throw Error("Unsupported file format.");
}

function parseCSV(text) {
  const rows=[];
  let row=[],field="",quoted=false;
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(c==='"'){
      if(quoted&&text[i+1]==='"'){field+='"';i++;}
      else quoted=!quoted;
    } else if(c===","&&!quoted){
      row.push(field);field="";
    } else if((c==="\n"||c==="\r")&&!quoted){
      if(c==="\r"&&text[i+1]==="\n")i++;
      row.push(field);
      if(row.some(x=>x.trim()))rows.push(row);
      row=[];field="";
    } else field+=c;
  }
  if(quoted)throw Error("Malformed CSV quoting.");
  row.push(field);
  if(row.some(x=>x.trim()))rows.push(row);
  return rows;
}

function bindWorkspace() {
  const text=document.getElementById("transcriptText");
  const upload=document.getElementById("fileInput");
  const run=document.getElementById("evaluateBtn");

  document.getElementById("sampleBtn").onclick=()=>{
    text.value=SAMPLE;
    upload.value="";
    showTranscript(parseTranscript(SAMPLE));
    setAgentState("idle","Sample ready","Ready to begin analysis");
  };

  upload.onchange=async()=>{
    const file=upload.files[0];
    if(!file)return;
    try{
      text.value=await readUpload(file);
      const turns=parseTranscript(text.value);
      if(!turns.length)throw Error("No valid speaker turns found.");
      showTranscript(turns);
      setAgentState("idle","Transcript ready",
        `${turns.length} dialogue turns loaded`);
    }catch(error){
      text.value="";
      setAgentState("error","Upload failed",error.message);
      alert(error.message);
    }
  };

  run.onclick=async()=>{
    if(running)return;

    const turns=parseTranscript(text.value);
    if(!turns.length){
      alert("Upload or paste a speaker-labelled transcript first.");
      return;
    }

    running=true;
    run.disabled=true;

    const metadata={
      agentName:document.getElementById("agentName").value,
      customerName:document.getElementById("customerName").value,
      timestampsAreCallRelative:
        document.getElementById("callRelative").checked
    };

    showTranscript(turns);
    setAgentState("reading","Reading interaction",
      `${turns.length} dialogue turns identified`);

    // Deterministic evaluation runs immediately.
    let findings=runRules(turns,config,metadata);
    showResults(findings,config,"Deterministic checks");

    // Contextual criteria are delegated to Gemini.
    const aiCriteria=config.criteria.filter(c=>
      c.enabled&&c.type==="ai"
    );

    try {
      if(aiCriteria.length){
        setAgentState("evaluating","Gemini is analysing",
          `${aiCriteria.length} contextual criteria`);

        const response=await fetch("/api/evaluate",{
          method:"POST",
          headers:{"Content-Type":"application/json"},
          body:JSON.stringify({
            turns,
            criteria:aiCriteria.map(c=>({
              id:c.id,name:c.name,category:c.category
            })),
            instructions:config.evaluatorInstructions,
            model:config.model
          })
        });

        const result=await response.json();
        if(!response.ok){
          throw Error(result.error||"Gemini evaluation failed.");
        }

        setAgentState("validating","Validating findings",
          "Matching AI evidence to transcript turns");

        const byId=new Map(result.findings.map(f=>[f.id,f]));
        findings=findings.map(f=>byId.get(f.id)||f);
        showResults(findings,config,`Gemini · ${result.model}`);
      }

      setAgentState("complete","Evaluation complete",
        "Scorecard and evidence ready");
    } catch(error){
      setAgentState("error","AI evaluation unavailable",
        error.message);
      // Retain valid deterministic results.
      showResults(findings,config,"Partial assessment · Gemini unavailable");
    } finally {
      running=false;
      run.disabled=false;
    }
  };
}

/**
 * @component QA-SETTINGS-001
 * @purpose Persist editable business and AI configuration.
 * @safety Validates thresholds, weights and model identifier.
 * @changeImpact Subsequent evaluations and model routing.
 */
function bindSettings() {
  document.getElementById("saveSettings").onclick=()=>{
    const next=structuredClone(config);

    for(const c of next.criteria){
      const weight=Number(document.querySelector(
        `[data-weight="${c.id}"]`).value);
      if(!Number.isFinite(weight)||weight<0||weight>100){
        alert(`Invalid weight for ${c.name}`);return;
      }
      c.weight=weight;
      c.enabled=document.querySelector(
        `[data-enabled="${c.id}"]`).checked;
    }

    const greeting=Number(document.getElementById(
      "greetingSeconds").value);
    const count=Number(document.getElementById(
      "customerNameCount").value);

    if(!Number.isInteger(greeting)||greeting<0||greeting>300||
       !Number.isInteger(count)||count<1||count>20){
      alert("Invalid deterministic rule thresholds.");
      return;
    }

    next.rules.greetingSeconds=greeting;
    next.rules.customerNameCount=count;
    next.rules.brandPhrases=document.getElementById(
      "brandPhrases").value.split(/\r?\n/)
      .map(s=>s.trim()).filter(Boolean);

    next.evaluatorInstructions=document.getElementById(
      "evaluatorInstructions").value.trim();
    next.model=document.getElementById("modelName").value.trim();

    if(!next.evaluatorInstructions||!next.model){
      alert("Evaluator instructions and model cannot be empty.");
      return;
    }
    if(!/^[a-zA-Z0-9._-]+$/.test(next.model)){
      alert("Invalid model identifier.");
      return;
    }

    next.version++;
    config=next;
    saveConfig(config);
    document.getElementById("settingsMessage").textContent=
      `Configuration version ${config.version} saved in this browser.`;
  };
}

navigate(currentPage);
