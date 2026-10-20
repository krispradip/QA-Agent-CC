/**
 * QA-PERIOD-001 | Reporting period and evidence-coverage analytics.
 *
 * Filters by the Genesys interaction start date, NOT evaluation date.
 * Undated conversations are included in All time only.
 * Date parsing is best-effort: unsupported/ambiguous dates stay undated.
 */

function dateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return y + "-" + m + "-" + d;
}

export function interactionDate(call) {
  const raw = String(call.start || "").trim();
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : dateKey(date);
}

export function applyPeriod(calls, filter = {}) {
  const mode = filter.mode || "all";
  if (mode === "all") {
    return { calls, undatedExcluded: 0, from: null, to: null };
  }
  const today = new Date();
  const to = dateKey(today);
  const begin = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  let from;
  let end = to;
  if (mode === "last7") begin.setDate(begin.getDate() - 6);
  else if (mode === "last30") begin.setDate(begin.getDate() - 29);
  else if (mode === "month") begin.setDate(1);
  else if (mode === "custom") {
    from = filter.from || "";
    end = filter.to || "";
  } else {
    return { calls, undatedExcluded: 0, from: null, to: null };
  }
  if (mode !== "custom") from = dateKey(begin);
  // Custom range without both dates is not a valid filter.
  if (!from || !end || from > end) {
    return {
      calls: [], undatedExcluded: 0, from, to: end,
      warning: "Choose a valid From and To date (From must be on or before To)."
    };
  }
  let undatedExcluded = 0;
  const filtered = calls.filter(c => {
    const date = interactionDate(c);
    if (!date) { undatedExcluded++; return false; }
    return date >= from && date <= end;
  });
  return { calls: filtered, undatedExcluded, from, to: end };
}

export function coverageBreakdown(call, rubric) {
  if (!call?.score || !call.findings?.length) return null;
  const byId = new Map((rubric?.criteria || []).map(c => [c.id, c]));
  const groups = [
    { id: "audio", title: "Audio or voice evidence required", criteria: [], weight: 0 },
    { id: "external", title: "System, SOP or verified identity evidence required", criteria: [], weight: 0 },
    { id: "timing", title: "Reliable greeting/timing evidence missing", criteria: [], weight: 0 },
    { id: "ai", title: "Insufficient or ambiguous transcript evidence", criteria: [], weight: 0 }
  ];
  let applicableWeight = 0, notApplicable = 0;
  for (const f of call.findings) {
    const criterion = byId.get(f.id);
    if (!criterion || !criterion.enabled || Number(criterion.weight) <= 0) continue;
    if (f.status === "NOT_APPLICABLE") { notApplicable++; continue; }
    const weight = Number(criterion.weight);
    applicableWeight += weight;
    if (f.status !== "UNVERIFIABLE") continue;
    const group = groups.find(g => g.id === criterion.mode) || groups[3];
    group.weight += weight;
    group.criteria.push({
      name: criterion.name,
      reason: f.reason || "Assessment evidence was insufficient.",
      weight
    });
  }
  return {
    groups: groups.filter(g => g.criteria.length).map(g => ({
      ...g,
      percentOfApplicable: applicableWeight
        ? Math.round(g.weight / applicableWeight * 100)
        : 0
    })),
    notApplicable,
    applicableWeight
  };
}
