
/**
 * QA-STORE-001
 * Purpose: Browser-only prototype settings persistence.
 * Depends on: scorecard.js
 * Impact: Configuration state between browser sessions.
 * Limitation: Settings are not synchronized across users.
 * Version: 2.0
 */

import { DEFAULT_CONFIG } from "../config/scorecard.js";

const KEY = "qualis-config-v2";

export function getConfig() {
  try {
    const x = JSON.parse(localStorage.getItem(KEY));

    if (!x) return structuredClone(DEFAULT_CONFIG);

    const byId = new Map(
      (x.criteria || []).map(c => [c.id, c])
    );

    return {
      ...structuredClone(DEFAULT_CONFIG),
      ...x,
      rules: {
        ...DEFAULT_CONFIG.rules,
        ...x.rules
      },
      criteria: DEFAULT_CONFIG.criteria.map(c => ({
        ...c,
        ...(byId.get(c.id) || {}),
        id: c.id,
        group: c.group,
        type: c.type
      }))
    };
  } catch {
    return structuredClone(DEFAULT_CONFIG);
  }
}

export function saveConfig(x) {
  localStorage.setItem(KEY, JSON.stringify(x));
}
