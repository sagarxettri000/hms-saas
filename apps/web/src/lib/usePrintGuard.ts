import { useEffect, useRef, useState } from 'react';

/** Seconds the user must wait before a duplicate print can be confirmed. */
export const REPRINT_COUNTDOWN_SECONDS = 3;

/**
 * Guard against accidental duplicate receipt printing.
 *
 * The first print proceeds immediately. Afterwards the invoice's print is
 * remembered in localStorage, so any further print must be confirmed on
 * purpose after a short countdown. The same hook instance also drives the
 * confirmation UI (see `confirming`/`countdown`).
 */
export function usePrintGuard(key: string) {
  const [alreadyPrinted, setAlreadyPrinted] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const pending = useRef<(() => void) | null>(null);

  useEffect(() => {
    try {
      setAlreadyPrinted(Boolean(localStorage.getItem(key)));
    } catch {
      setAlreadyPrinted(false);
    }
  }, [key]);

  useEffect(() => {
    if (!confirming) return;
    setCountdown(REPRINT_COUNTDOWN_SECONDS);
    const timer = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          clearInterval(timer);
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [confirming]);

  function markPrinted() {
    try {
      localStorage.setItem(key, new Date().toISOString());
    } catch {
      // storage unavailable (private mode) — printing still proceeds
    }
    setAlreadyPrinted(true);
  }

  function commit(print: () => void) {
    markPrinted();
    setConfirming(false);
    print();
  }

  /** Bind to the print button. Repeat prints open the confirmation prompt. */
  function requestPrint(print: () => void) {
    if (alreadyPrinted) {
      pending.current = print;
      setConfirming(true);
      return;
    }
    commit(print);
  }

  /** Bind to the "Confirm print" button shown while `confirming`. */
  function confirmPrint() {
    const print = pending.current;
    pending.current = null;
    commit(print ?? (() => {}));
  }

  /** Bind to the "Cancel" button shown while `confirming`. */
  function cancelPrint() {
    pending.current = null;
    setConfirming(false);
  }

  return { alreadyPrinted, confirming, countdown, requestPrint, confirmPrint, cancelPrint };
}
