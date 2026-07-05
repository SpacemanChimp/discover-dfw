"use client";
/* "My Shelf" — saved homes, saved searches, and the guest→member flow.

   Guest mode (no session): everything lives in localStorage, exactly as the
   prototype specified. Signed in: Supabase Postgres is the source of truth
   (RLS-scoped to the user); on first sign-in the guest shelf merges into the
   account with existing account rows winning, then the local copy clears.
   If Supabase env vars are absent the provider degrades to the Phase-1
   local-only stub so the site never hard-depends on the backend. */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import type { SavedHome, SavedSearchFilter } from "./mls/types";
import { getSupabaseBrowser } from "./db/client";

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
  /** False until storage/session have been read — render neutral UI before then. */
  ready: boolean;
  /** "supabase" when real auth is configured; "local" is the env-less stub. */
  authMode: "supabase" | "local";
  savedCount: number;
  isSaved(listingKey: string): boolean;
  toggleSave(listingKey: string, priceAtSave: number, status?: string): void;
  saveSearch(s: Omit<SavedSearchFilter, "id" | "createdAt">): void;
  removeSearch(id: string): void;
  /** Supabase mode: send the magic link. Resolves to an error message or null. */
  requestMagicLink(email: string): Promise<string | null>;
  /** Supabase mode: start Google OAuth. Resolves to an error message or null. */
  signInWithGoogle(): Promise<string | null>;
  signOut(): void;
  /** Local-stub mode only (no env): the Phase-1 fake account. */
  createLocalAccount(email: string): void;
  gateOpen: boolean;
  openGate(): void;
  closeGate(): void;
  authOpen: boolean;
  openAuth(): void;
  closeAuth(): void;
  toast: string | null;
}

const ShelfContext = createContext<ShelfContextValue | null>(null);

function loadLocal(): ShelfState {
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
  const supabase = typeof window === "undefined" ? null : getSupabaseBrowser();
  const authMode: "supabase" | "local" = supabase ? "supabase" : "local";

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
  const sessionUserId = useRef<string | null>(null);
  const mergedThisSession = useRef(false);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2400);
  }, []);

  const persistLocal = (next: ShelfState) => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(next));
    } catch {
      /* storage full/blocked — state still lives for the session */
    }
  };

  /** Guest-mode state update, mirrored to localStorage. */
  const updateLocal = useCallback((fn: (prev: ShelfState) => ShelfState) => {
    setState((prev) => {
      const next = fn(prev);
      persistLocal(next);
      return next;
    });
  }, []);

  /* ---- account shelf: DB reads/writes (RLS scopes to the session user) ---- */

  const loadAccountShelf = useCallback(
    async (email: string) => {
      if (!supabase) return;
      const [homesRes, searches] = await Promise.all([
        // saved listings go through the API routes (RLS-scoped server-side)
        fetch("/api/saved-listings").then((r) => (r.ok ? r.json() : { saves: [] })).catch(() => ({ saves: [] })),
        supabase
          .from("saved_searches")
          .select("id, name, filters, query_label, query_string, frequency, created_at")
          .order("created_at", { ascending: false }),
      ]);
      const saved: Record<string, SavedHome> = {};
      for (const r of (homesRes.saves ?? []) as SavedHome[]) {
        saved[r.listingKey] = r;
      }
      const list: SavedSearchFilter[] = (searches.data ?? []).map((r) => ({
        id: r.id,
        name: r.name,
        filters: r.filters ?? undefined,
        queryLabel: r.query_label,
        queryString: r.query_string,
        frequency: r.frequency,
        createdAt: r.created_at,
      }));
      setState((prev) => ({ ...prev, saved, searches: list, account: { email } }));
    },
    [supabase]
  );

  /** First sign-in: guest rows merge in; existing account rows win. */
  const mergeGuestShelf = useCallback(
    async (userId: string) => {
      if (!supabase) return;
      const guest = loadLocal();
      const homes = Object.values(guest.saved);
      if (homes.length) {
        await fetch("/api/saved-listings/merge", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ saves: homes }),
        }).catch(() => {});
      }
      if (guest.searches.length) {
        await supabase.from("saved_searches").insert(
          guest.searches.map((s) => ({
            id: s.id.startsWith("ss-") ? undefined : s.id,
            user_id: userId,
            name: s.name,
            filters: s.filters ?? null,
            query_label: s.queryLabel,
            query_string: s.queryString,
            frequency: s.frequency,
            created_at: s.createdAt,
          }))
        );
      }
      // the guest copy has been adopted — clear it (keep the gate memory)
      persistLocal({ saved: {}, searches: [], account: null, gateShown: guest.gateShown });
    },
    [supabase]
  );

  /* ---- boot: local first, then session ---- */
  useEffect(() => {
    const local = loadLocal();
    if (supabase && local.account) {
      // Stale Phase-1 stub account written before the backend existed.
      // In supabase mode only a real session may set `account` — otherwise
      // the UI claims "synced" with no session and SIGN IN never shows.
      local.account = null;
      persistLocal(local);
    }
    setState(local);
    if (!supabase) {
      setReady(true);
      return;
    }
    let cancelled = false;

    supabase.auth.getSession().then(async ({ data }) => {
      if (cancelled) return;
      const user = data.session?.user;
      if (user?.email) {
        sessionUserId.current = user.id;
        await loadAccountShelf(user.email);
      }
      setReady(true);
    });

    const { data: sub } = supabase.auth.onAuthStateChange(async (event, session) => {
      const user = session?.user;
      if (event === "SIGNED_IN" && user?.email && sessionUserId.current !== user.id) {
        sessionUserId.current = user.id;
        if (!mergedThisSession.current) {
          mergedThisSession.current = true;
          await mergeGuestShelf(user.id);
        }
        await loadAccountShelf(user.email);
        setAuthOpen(false);
        setGateOpen(false);
        showToast("Welcome — your shelf now travels with you.");
      }
      if (event === "SIGNED_OUT") {
        sessionUserId.current = null;
        mergedThisSession.current = false;
        setState(loadLocal());
        showToast("Signed out — back to a guest shelf.");
      }
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
      if (toastTimer.current) clearTimeout(toastTimer.current);
      if (gateTimer.current) clearTimeout(gateTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---- shelf actions (route to DB or localStorage by session) ---- */

  const toggleSave = useCallback(
    (listingKey: string, priceAtSave: number, status?: string) => {
      const userId = sessionUserId.current;
      const sourcePage = typeof window !== "undefined" ? window.location.pathname : undefined;
      let firstGuestSave = false;

      setState((prev) => {
        const saved = { ...prev.saved };
        let next: ShelfState;
        if (saved[listingKey]) {
          delete saved[listingKey];
          next = { ...prev, saved };
          if (userId) {
            fetch(`/api/saved-listings?key=${encodeURIComponent(listingKey)}`, { method: "DELETE" })
              .then((r) => !r.ok && showToast("That didn’t stick — try again."))
              .catch(() => showToast("That didn’t stick — try again."));
          }
        } else {
          const rec: SavedHome = {
            listingKey,
            savedAt: new Date().toISOString(),
            priceAtSave,
            sourcePage,
            lastSeenStatus: status,
            lastSeenPrice: priceAtSave,
          };
          saved[listingKey] = rec;
          firstGuestSave = !userId && !prev.account && !prev.gateShown;
          next = { ...prev, saved, gateShown: prev.gateShown || firstGuestSave };
          if (userId) {
            fetch("/api/saved-listings", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ listingKey, price: priceAtSave, status, sourcePage }),
            })
              .then((r) => !r.ok && showToast("That didn’t stick — try again."))
              .catch(() => showToast("That didn’t stick — try again."));
          }
        }
        if (!userId) persistLocal(next);
        const nowSaved = !!next.saved[listingKey];
        showToast(
          nowSaved
            ? Object.keys(next.saved).length === 1
              ? "Saved — first home on your shelf."
              : "Saved — on your shelf."
            : "Removed from your shelf."
        );
        return next;
      });

      if (firstGuestSave) {
        if (gateTimer.current) clearTimeout(gateTimer.current);
        gateTimer.current = setTimeout(() => {
          setToast(null);
          setGateOpen(true);
        }, 1100);
      }
    },
    [supabase, showToast]
  );

  const saveSearch = useCallback(
    (s: Omit<SavedSearchFilter, "id" | "createdAt">) => {
      const userId = sessionUserId.current;
      const rec: SavedSearchFilter = {
        ...s,
        id:
          userId && typeof crypto !== "undefined" && crypto.randomUUID
            ? crypto.randomUUID()
            : "ss-" + Date.now().toString(36),
        createdAt: new Date().toISOString(),
      };
      setState((prev) => {
        const next = { ...prev, searches: [rec, ...prev.searches] };
        if (!userId) persistLocal(next);
        return next;
      });
      if (userId && supabase) {
        supabase
          .from("saved_searches")
          .insert({
            id: rec.id,
            user_id: userId,
            name: rec.name,
            filters: rec.filters ?? null,
            query_label: rec.queryLabel,
            query_string: rec.queryString,
            frequency: rec.frequency,
            created_at: rec.createdAt,
          })
          .then(({ error }) => error && showToast("That didn’t stick — try again."));
      }
      showToast("Standing order placed — we’ll watch the market.");
    },
    [supabase, showToast]
  );

  const removeSearch = useCallback(
    (id: string) => {
      const userId = sessionUserId.current;
      setState((prev) => {
        const next = { ...prev, searches: prev.searches.filter((x) => x.id !== id) };
        if (!userId) persistLocal(next);
        return next;
      });
      if (userId && supabase) {
        supabase.from("saved_searches").delete().eq("id", id).then(() => {});
      }
    },
    [supabase]
  );

  /* ---- auth actions ---- */

  const recordSignupLead = (email: string) => {
    fetch("/api/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "account", email }),
    }).catch(() => {});
  };

  const requestMagicLink = useCallback(
    async (email: string): Promise<string | null> => {
      if (!supabase) return "Accounts aren’t wired up in this environment yet.";
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      });
      if (error) return error.message;
      recordSignupLead(email);
      return null;
    },
    [supabase]
  );

  const signInWithGoogle = useCallback(async (): Promise<string | null> => {
    if (!supabase) return "Accounts aren’t wired up in this environment yet.";
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    return error ? error.message : null;
  }, [supabase]);

  const signOut = useCallback(() => {
    if (supabase) supabase.auth.signOut();
  }, [supabase]);

  const createLocalAccount = useCallback(
    (email: string) => {
      updateLocal((prev) => ({ ...prev, account: { email } }));
      setAuthOpen(false);
      setGateOpen(false);
      showToast("Welcome — your shelf now travels with you.");
      recordSignupLead(email);
    },
    [updateLocal, showToast]
  );

  const value: ShelfContextValue = {
    ...state,
    ready,
    authMode,
    savedCount: Object.keys(state.saved).length,
    isSaved: (k) => !!state.saved[k],
    toggleSave,
    saveSearch,
    removeSearch,
    requestMagicLink,
    signInWithGoogle,
    signOut,
    createLocalAccount,
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
