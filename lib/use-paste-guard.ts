"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export const PASTE_BLOCKED_MSG =
  "Pasting is disabled in this study. Please type your response in your own words.";

const MESSAGE_MS = 4000;

/**
 * Front-end-only guard for written-response fields: blocks paste, copy, cut,
 * drop and the context menu. Paste/drop attempts show a temporary inline notice.
 * Nothing is logged or stored. Spread `guardProps` onto the field only — never globally.
 */
export function usePasteGuard() {
  const [pasteBlocked, setPasteBlocked] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const showNotice = useCallback(() => {
    setPasteBlocked(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setPasteBlocked(false), MESSAGE_MS);
  }, []);

  const block = (e: React.SyntheticEvent) => e.preventDefault();
  const blockWithNotice = (e: React.SyntheticEvent) => { e.preventDefault(); showNotice(); };

  const guardProps = {
    onPaste:       blockWithNotice,
    onDrop:        blockWithNotice,
    onCopy:        block,
    onCut:         block,
    onContextMenu: block,
  };

  return { guardProps, pasteBlocked };
}
