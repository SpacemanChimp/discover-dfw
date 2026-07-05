"use client";
/* "My Shelf" — saved homes, saved searches, and the guest→member flow.
   Phase 1 persists to localStorage (guest-first, per the prototype). Phase 2
   turns this store into a cache in front of the account DB and merges the
   guest shelf into the account on first sign-in. */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import type { SavedHome, SavedSearchFilter } from "./mls/types";

const LS_KEY = "ddfw.shelf.v1";

export interface ShelfAccount {
  email: string;
}

interface ShelfState {
  saved: Record<string, SavedHome>;
  searches: SavedSearchFilter[];
  account: ShelfAccount | null;
  gateShown: boolean;
}

interface ShelfContextValue extends ShelfState {
  /** False until localStorage has been read — render neutral UI before then. */
  ready: boolean;
  savedCount: number;
  isSaved(listingKey: string): boolean;
  toggleSave(listingKey: string, priceAtSave: number): void;
  saveSearch(s: Omit<SavedSearchFilter, "id" | "createdAt">): void;
  removeSearch(id: string): void;
  createAccount(email: string): void;
  /** Soft gate sheet visibility (asked once, after the first guest save). */
  gateOpen: boolean;
  openGate(): void;
  closeGate(): void;
  /** Membership modal visibility. */
  authOpen: boolean;
  openAuth(): void;
  closeAuth(): void;
  toast: string | null;
}

const ShelfContext = createContext<ShelfContextValue | null>(null);

function load(): ShelfState {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      return {
        saved: p.saved || {},
        searches: p.searches || [],
        account: p.account || null,
        gateShown: !!p.gateShown,
      };
    }
  } catch {
    /* corrupted or unavailable storage → fresh shelf */
  }
  return { saved: {}, searches: [], account: null, gateShown: false };
}

export function ShelfProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<ShelfState>({
    saved: {},
    searches: [],
    account: null,
    gateShown: false,
  });
  const [ready, setReady] = useState(false);
  const [gateOpen, setGateOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setState(load());
    setReady(true);
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
      if (gateTimer.current) clearTimeout(gateTimer.current);
    };
  }, []);

  const persist = (next: ShelfState) => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(next));
    } catch {
      /* storage full/blocked — state still lives for the session */
    }
  };

  const update = useCallback((fn: (prev: ShelfState) => ShelfState) => {
    setState((prev) => {
      const next = fn(prev);
      persist(next);
      return next;
    });
  }, []);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2400);
  }, []);

  const toggleSave = useCallback(
    (listingKey: string, priceAtSave: number) => {
      let firstGuestSave = false;
      update((prev) => {
        const saved = { ...prev.saved };
        if (saved[listingKey]) {
          delete saved[listingKey];
          return { ...prev, saved };
        }
        saved[listingKey] = {
          listingKey,
          savedAt: new Date().toISOString(),
          priceAtSave,
        };
        firstGuestSave = !prev.account && !prev.gateShown;
        return { ...prev, saved, gateShown: prev.gateShown || firstGuestSave };
      });
      setState((cur) => {
        // toast text depends on the post-update state; read it here
        const nowSaved = !!cur.saved[listingKey];
        showToast(
          nowSaved
            ? Object.keys(cur.saved).length === 1
              ? "Saved — first home on your shelf."
              : "Saved — on your shelf."
            : "Removed from your shelf."
        );
        return cur;
      });
      if (firstGuestSave) {
        if (gateTimer.current) clearTimeout(gateTimer.current);
        gateTimer.current = setTimeout(() => {
          setToast(null);
          setGateOpen(true);
        }, 1100);
      }
    },
    [update, showToast]
  );

  const saveSearch = useCallback(
    (s: Omit<SavedSearchFilter, "id" | "createdAt">) => {
      update((prev) => ({
        ...prev,
        searches: [
          {
            ...s,
            id: "ss-" + Date.now().toString(36),
            createdAt: new Date().toISOString(),
          },
          ...prev.searches,
        ],
      }));
      showToast("Standing order placed — we’ll watch the market.");
    },
    [update, showToast]
  );

  const removeSearch = useCallback(
    (id: string) => {
      update((prev) => ({
        ...prev,
        searches: prev.searches.filter((x) => x.id !== id),
      }));
    },
    [update]
  );

  const createAccount = useCallback(
    (email: string) => {
      update((prev) => ({ ...prev, account: { email } }));
      setAuthOpen(false);
      setGateOpen(false);
      showToast("Welcome — your shelf now travels with you.");
      // Phase 1: record the signup as a lead so nothing is lost before real auth.
      fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "account", email }),
      }).catch(() => {});
    },
    [update, showToast]
  );

  const value: ShelfContextValue = {
    ...state,
    ready,
    savedCount: Object.keys(state.saved).length,
    isSaved: (k) => !!state.saved[k],
    toggleSave,
    saveSearch,
    removeSearch,
    createAccount,
    gateOpen,
    openGate: () => setGateOpen(true),
    closeGate: () => setGateOpen(false),
    authOpen,
    openAuth: () => {
      setGateOpen(false);
      setAuthOpen(true);
    },
    closeAuth: () => setAuthOpen(false),
    toast,
  };

  return <ShelfContext.Provider value={value}>{children}</ShelfContext.Provider>;
}

export function useShelf(): ShelfContextValue {
  const ctx = useContext(ShelfContext);
  if (!ctx) throw new Error("useShelf must be used inside <ShelfProvider>");
  return ctx;
}
