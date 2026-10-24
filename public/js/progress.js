/**
 * QA-PROGRESS-STATE-001 | Display-only timing for the last evaluation cycle.
 *
 * The application saves results in IndexedDB separately. Only non-sensitive
 * timing and count metadata are persisted here so the UI can show an accurate
 * completed duration after a browser refresh. Never save transcript data.
 */
export const PROGRESS_KEY="qaai-evaluation-timing-v1";

const validNumber=n=>Number.isFinite(n)&&n>=0;
export const validProgress=p=>Boolean(p&&
  validNumber(p.started)&&p.started>0&&
  Number.isInteger(p.total)&&p.total>0&&
  Number.isInteger(p.completed)&&p.completed>=0&&p.completed<=p.total&&
  Number.isInteger(p.callCount)&&p.callCount>=p.total&&
  (p.ended===undefined||(validNumber(p.ended)&&p.ended>=p.started)));

export function readProgress(storage) {
  try {
    const value=storage?.getItem(PROGRESS_KEY);
    if(!value)return null;
    const p=JSON.parse(value);
    return validProgress(p)&&p.ended!==undefined&&
      ["complete","stopped","quota"].includes(p.outcome)?p:null;
  }catch{return null;}
}
export function saveProgress(storage,progress){
  if(!validProgress(progress)||progress.ended===undefined)return false;
  try{storage?.setItem(PROGRESS_KEY,JSON.stringify(progress));return true;}
  catch{return false;}
}
export function clearProgress(storage){
  try{storage?.removeItem?.(PROGRESS_KEY);}catch{}
}
const clock=n=>{
  const seconds=Math.max(0,Math.floor(n));
  return String(Math.floor(seconds/60)).padStart(2,"0")+":"+String(seconds%60).padStart(2,"0");
};

/**
 * Timing shown by the Studio:
 * - no current/retained run: no fictitious elapsed time or ongoing ETA;
 * - in flight: wall-clock elapsed and ETA only after a completed call;
 * - finished: freeze elapsed at end and show an appropriate terminal state.
 */
export function progressLabels(p,{now=Date.now(),callCount=0,handled=0}={}){
  const fallback={elapsed:"—",eta:"—",count:`${handled} / ${callCount} processed`};
  if(!validProgress(p)||p.callCount!==callCount)return fallback;
  const ended=p.ended!==undefined;
  const time=ended?p.ended:now;
  const seconds=Math.max(0,Math.floor((time-p.started)/1000));
  const elapsed=clock(seconds);
  const count=`${p.completed} / ${p.total} processed`;
  if(ended){
    const eta=p.outcome==="stopped"?"Stopped":p.outcome==="quota"?"Interrupted":"Complete";
    return {elapsed,eta,count};
  }
  const remaining=p.total-p.completed;
  const eta=remaining===0?"00:00":
    p.completed>0?"~"+clock(Math.ceil(seconds/p.completed*remaining)):"Calculating…";
  return {elapsed,eta,count};
}
