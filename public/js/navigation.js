/**
 * QA-NAV-001 | Reset the document and any nested main scroll viewport
 * after a top-level page transition. Keeping this separate makes it
 * regression-testable without a browser and prevents stale scroll positions
 * when opening an agent assessment from the bottom of Studio.
 */
export function scrollPageToTop(win, doc) {
  win.scrollTo(0, 0);
  if (doc.scrollingElement) doc.scrollingElement.scrollTop = 0;
  const main = doc.querySelector(".main");
  if (main) main.scrollTop = 0;
}
