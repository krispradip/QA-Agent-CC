/**
 * QA-REF-UI-001 | Dedicated Config master and reference-library workspace.
 * CSV data is escaped before rendering; each uploaded dataset remains editable
 * via re-import/versioning, enable/disable and deletion.
 */
import {esc} from "./ui.js";
import {REFERENCE_SCHEMAS} from "./reference.js";

export function configShell(tab,content){
  return `<section class="qa-config-master">
    <nav class="qa-config-tabs" role="tablist" aria-label="Configuration sections">
      <button type="button" role="tab" data-config-tab="rubric" aria-selected="${tab==="rubric"}" class="${tab==="rubric"?"active":""}">◫ QA Configurator</button>
      <button type="button" role="tab" data-config-tab="references" aria-selected="${tab==="references"}" class="${tab==="references"?"active":""}">▤ Reference Library</button>
    </nav>
    <div role="tabpanel" class="qa-config-content">${content}</div>
  </section>`;
}

export function referenceLibraryView(library){
  const files=library.datasets||[];
  const active=files.filter(d=>d.enabled);
  return `<section class="qa-reference">
    <div class="panel qa-ref-intro">
      <div class="panel-heading"><div><span class="kicker">EVALUATION INTELLIGENCE</span>
      <h3>Reference Library</h3></div><span class="tag">REV. ${Number(library.revision)||1}</span></div>
      <p class="muted">Manage approved language and evaluation context for Gemini. Upload structured CSV files, preview their contents and activate the versions used in new assessments. Original transcripts are never rewritten.</p>
      <div class="qa-ref-stats">
        <div><strong>${files.length}</strong><small>Uploaded versions</small></div>
        <div><strong>${active.length}</strong><small>Active datasets</small></div>
        <div><strong>${active.reduce((sum,f)=>sum+f.rows.length,0)}</strong><small>Active reference entries</small></div>
        <div><strong>${Object.keys(REFERENCE_SCHEMAS).length}</strong><small>Reference structures</small></div>
      </div>
      <p class="qa-ref-notice">Storage: this browser only. These files are not shared across devices or team members. Entries are contextual guidance, not proof that an agent satisfied a QA checkpoint.</p>
    </div>
    <div class="qa-ref-catalog">
      ${Object.entries(REFERENCE_SCHEMAS).map(([type,config],i)=>`
      <section class="panel qa-ref-type">
        <div class="qa-ref-type-head">
          <span class="qa-ref-number">0${i+1}</span>
          <div><h3>${esc(config.title)}</h3><p class="muted">${esc(config.description)}</p></div>
          <span class="qa-ref-count">${files.filter(f=>f.type===type&&f.enabled).length} active</span>
        </div>
        <div class="qa-ref-fields"><strong>CSV structure</strong><div>${config.columns.map(col=>`<code>${esc(col)}</code>`).join("")}</div></div>
        <p class="qa-ref-required"><b>Required:</b> ${config.required.map(esc).join(", ")}</p>
        <div class="qa-ref-actions">
          <button type="button" class="secondary" data-ref-template="${type}">↓ Download CSV template</button>
          <label class="qa-ref-file-label">↑ Upload ${esc(config.title)} CSV
            <input type="file" accept=".csv,text/csv" data-ref-upload="${type}" aria-label="Upload ${esc(config.title)} CSV">
          </label>
        </div>
      </section>`).join("")}
    </div>
    <section class="panel qa-ref-files">
      <div class="panel-heading"><div><span class="kicker">GOVERNED REFERENCES</span>
      <h3>Uploaded reference files</h3></div>
      <span class="tag">${files.length} versions</span></div>
      <p class="muted">Uploading the same filename under the same reference type creates a new version and deactivates the previous one. Toggle a previous version back on to roll back.</p>
      ${files.length?files.map(file=>{
        const config=REFERENCE_SCHEMAS[file.type];
        return `<article class="qa-ref-dataset">
          <div class="qa-ref-dataset-header">
            <label class="qa-ref-switch"><input type="checkbox" data-ref-enabled="${esc(file.id)}" ${file.enabled?"checked":""}><span>${file.enabled?"Active":"Inactive"}</span></label>
            <div class="qa-ref-filename"><strong>${esc(file.name)}</strong><small>${esc(config.title)} · v${file.version} · ${file.rows.length} rows · ${esc(file.uploadedAt?.slice(0,10)||"")}</small></div>
            <button type="button" class="qa-ref-delete secondary" data-ref-delete="${esc(file.id)}" aria-label="Delete ${esc(file.name)}">Delete</button>
          </div>
          <details class="qa-ref-preview"><summary>Preview CSV contents (${Math.min(8,file.rows.length)} of ${file.rows.length} rows)</summary>
            <div class="qa-ref-table-wrap"><table><thead><tr>${config.columns.map(k=>`<th>${esc(k)}</th>`).join("")}</tr></thead><tbody>
            ${file.rows.slice(0,8).map(row=>`<tr>${config.columns.map(key=>`<td>${esc(row[key]||"")}</td>`).join("")}</tr>`).join("")}
            </tbody></table></div>
          </details>
        </article>`;
      }).join(""):`<div class="qa-ref-empty"><strong>No reference files uploaded yet.</strong><p>Download a category template above, populate it with approved business examples, and upload the CSV.</p></div>`}
    </section>
    <p class="qa-ref-footnote">Applicability is controlled by CSV businessUnit, market, channel and criterionId fields. Use <b>All</b> for a global entry. BU-specific entries are excluded when the source interaction does not explicitly identify the BU.</p>
  </section>`;
}
