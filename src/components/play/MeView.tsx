"use client";
// /me (UX §3.7): my receipts (CANON and BALLOT, grouped by show) as paper cards, my numbers and "Delete my data"
// behind a confirm sheet. Handles: loading, no session, empty list, offline.
// A visitor who never joined a show has no session token: the page says so without calling /api/me, so a first visit
// never logs a red 401 (audit #20). Only when the browser blocks storage (so we cannot tell) does it ask the server.
import { Sparkles, WifiOff, Ticket, Trash2, WandSparkles } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import type { MeRes } from "@/lib/api/contracts";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { cn } from "@/components/ui/cn";
import { Footer } from "@/components/ui/Footer";
import { PaperCard } from "@/components/ui/PaperCard";
import { Sheet } from "@/components/ui/Sheet";
import { Skeleton } from "@/components/ui/Skeleton";
import { Stamp } from "@/components/ui/Stamp";
import { StageBackdrop } from "@/components/ui/StageBackdrop";
import { deleteMyData, getMe, getStoredToken } from "@/lib/client/api";
import { clearSession, getSession } from "@/lib/client/session";
import { COPY } from "@/lib/copy";
import { groupByShow } from "./logic";
import { PLAY_COPY } from "./playCopy";

type Me = Extract<MeRes, { ok: true }>;
type View =
  | { kind: "loading" }
  | { kind: "ready"; me: Me }
  | { kind: "nosession" }
  | { kind: "error"; message: string }
  | { kind: "deleted" };

const subscribeNone = () => () => {};

/** true = this browser has a session token, false = it has none, null = storage is blocked, so we cannot tell. */
function knownVisitor(): boolean | null {
  try {
    window.localStorage.getItem("cp_probe");
  } catch {
    return null;
  }
  return Boolean(getStoredToken() || getSession());
}

function Frame({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <StageBackdrop roundNo={1} />
      <header className="mx-auto flex w-full max-w-2xl items-center px-4 py-3">
        <Link href="/" className="inline-flex min-h-11 items-center gap-2 font-display text-lead font-extrabold tracking-tight">
          <svg width="26" height="26" viewBox="0 0 28 28" aria-hidden="true">
            <circle cx="8" cy="9" r="5.5" fill="var(--gel-a)" />
            <circle cx="20" cy="9" r="5.5" fill="var(--gel-b)" />
            <circle cx="14" cy="20" r="5.5" fill="var(--gel-c)" />
          </svg>
          {COPY.brand}
        </Link>
      </header>
      <main id="main" className="mx-auto w-full max-w-2xl flex-1 px-4 pt-2 pb-12">
        {children}
      </main>
      <Footer />
    </div>
  );
}

function Stat({ value, label, gold }: { value: number; label: string; gold?: boolean }) {
  const lit = gold && value > 0;
  return (
    <div className={cn("rounded-card border px-3 py-3.5", lit ? "border-gold bg-gold text-ink" : "border-stage-line bg-stage-1")}>
      <p className="font-display text-[36px] leading-none font-extrabold tabular-nums">{value}</p>
      <p className={cn("mt-1.5 text-small", lit ? "text-ink" : "text-muted-on-stage")}>{label}</p>
    </div>
  );
}

function Message({ icon, title, body, children }: { icon: ReactNode; title: string; body: string; children?: ReactNode }) {
  return (
    <Card as="section" className="p-6 text-center">
      <span aria-hidden="true" className="mx-auto grid size-14 place-items-center rounded-full bg-paper text-ink shadow-contact">
        {icon}
      </span>
      <h1 className="mt-4 font-display text-h2 leading-tight">{title}</h1>
      <p className="mx-auto mt-2 max-w-[44ch] text-muted-on-stage">{body}</p>
      {children ? <div className="mt-5 flex flex-col items-center gap-3">{children}</div> : null}
    </Card>
  );
}

export function MeView() {
  const known = useSyncExternalStore(subscribeNone, knownVisitor, () => null);
  const [fetched, setFetched] = useState<View | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    // Read storage again here: during hydration `known` still holds the server's answer (null), and a first-time
    // visitor must not trigger a request that can only come back 401.
    if (knownVisitor() === false) return;
    let alive = true;
    void getMe().then((r) => {
      if (!alive) return;
      if (r.ok) setFetched({ kind: "ready", me: r });
      else if (r.code === "NO_SESSION") setFetched({ kind: "nosession" });
      else setFetched({ kind: "error", message: r.message });
    });
    return () => {
      alive = false;
    };
  }, [attempt]);

  const view: View = fetched ?? (known === false ? { kind: "nosession" } : { kind: "loading" });

  async function confirmDelete() {
    setDeleting(true);
    setDeleteError(null);
    const r = await deleteMyData();
    setDeleting(false);
    if (!r.ok) {
      setDeleteError(r.message);
      return;
    }
    clearSession();
    setConfirmOpen(false);
    setFetched({ kind: "deleted" });
  }

  if (view.kind === "loading") {
    return (
      <Frame>
        <div role="status" className="space-y-4">
          <span className="sr-only">Loading your receipts…</span>
          <Skeleton className="h-10 w-2/3" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-[92px] rounded-card" />
            ))}
          </div>
          <Skeleton tone="paper" className="h-28 w-full rounded-card" />
          <Skeleton tone="paper" className="h-28 w-full rounded-card" />
        </div>
      </Frame>
    );
  }

  if (view.kind === "nosession") {
    return (
      <Frame>
        <Message icon={<Ticket className="size-7" />} title={PLAY_COPY.me.noSessionTitle} body={PLAY_COPY.me.noSessionBody}>
          <ButtonLink href="/" size="lg">
            {PLAY_COPY.me.emptyAction}
          </ButtonLink>
        </Message>
      </Frame>
    );
  }

  if (view.kind === "error") {
    return (
      <Frame>
        <Message icon={<WifiOff className="size-7" />} title={COPY.states.unreachable.title} body={view.message}>
          <Button
            variant="secondary"
            onClick={() => {
              setFetched(null);
              setAttempt((n) => n + 1);
            }}
          >
            {PLAY_COPY.me.retry}
          </Button>
        </Message>
      </Frame>
    );
  }

  if (view.kind === "deleted") {
    return (
      <Frame>
        <Message icon={<Trash2 className="size-7" />} title={PLAY_COPY.me.del.doneTitle} body={PLAY_COPY.me.del.doneBody}>
          <ButtonLink href="/" size="lg" data-testid="deleted-home">
            {PLAY_COPY.me.del.doneAction}
          </ButtonLink>
        </Message>
      </Frame>
    );
  }

  const { me } = view;
  const groups = groupByShow(me.receipts);

  return (
    <Frame>
      <h1 className="font-display text-h1">{PLAY_COPY.me.title}</h1>
      <p className="mt-1 text-muted-on-stage">
        {me.user.displayName}. {PLAY_COPY.me.sub}
      </p>

      <div data-testid="me-stats" className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat value={me.stats.ideas} label={PLAY_COPY.me.stats.ideas} />
        <Stat value={me.stats.ballots} label={PLAY_COPY.me.stats.ballots} />
        <Stat value={me.stats.canon} label={PLAY_COPY.me.stats.canon} gold />
        <Stat value={me.stats.shows} label={PLAY_COPY.me.stats.shows} />
      </div>

      {groups.length === 0 ? (
        <div className="mt-6">
          <Message icon={<WandSparkles className="size-7" />} title={PLAY_COPY.me.emptyTitle} body={PLAY_COPY.me.emptyBody}>
            <ButtonLink href="/" size="lg">
              {PLAY_COPY.me.emptyAction}
            </ButtonLink>
          </Message>
        </div>
      ) : (
        <div className="mt-8 space-y-8">
          {groups.map((g) => (
            <section key={g.showId} aria-labelledby={`show-${g.showId}`}>
              <div className="flex items-baseline justify-between gap-3">
                <h2 id={`show-${g.showId}`} className="min-w-0 truncate font-script text-h3 font-semibold tracking-normal">
                  {g.items[0].showTitle}
                </h2>
                <Link href={`/story/${g.showId}`} className="inline-flex min-h-11 shrink-0 items-center text-small font-semibold text-on-stage underline underline-offset-4">
                  {PLAY_COPY.me.readStory}
                </Link>
              </div>
              <ul className="mt-2 space-y-4">
                {g.items.map((rc) => (
                  <li key={rc.id}>
                    <PaperCard
                      as="article"
                      tone={rc.type === "CANON" ? "paper" : "paper-2"}
                      edge={rc.type === "CANON" ? "gold" : undefined}
                      data-testid="receipt"
                      data-type={rc.type}
                      className="px-4 pt-5 pb-4"
                    >
                      {rc.type === "CANON" ? <Stamp kind="canon" size="sm" animate={false} className="absolute -top-2.5 right-3" /> : null}
                      <p className="flex items-center gap-2 text-small text-ink-muted">
                        {rc.type === "BALLOT" ? <Sparkles aria-hidden="true" className="size-4" /> : null}
                        <span className="font-semibold text-ink">{rc.type === "CANON" ? PLAY_COPY.me.canon : PLAY_COPY.me.ballot}</span>
                        <span>{PLAY_COPY.me.round(rc.roundNo)}</span>
                      </p>
                      <blockquote className="mt-2 font-script text-[20px] leading-[1.35] font-semibold break-words">“{rc.ideaText}”</blockquote>
                      <p className="mt-2 text-small text-ink-muted">
                        {rc.type === "CANON" ? "Became canon as" : "Fed option"} <span className="font-semibold text-ink">{rc.optionLabel}</span>
                      </p>
                    </PaperCard>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      <div className="mt-10 border-t border-stage-line pt-6">
        <Button variant="secondary" data-testid="delete-data" onClick={() => setConfirmOpen(true)}>
          {PLAY_COPY.me.del.open}
        </Button>
      </div>

      <Sheet open={confirmOpen} onClose={() => (deleting ? undefined : setConfirmOpen(false))} title={PLAY_COPY.me.del.title}>
        <p className="text-on-stage">{PLAY_COPY.me.del.body}</p>
        <p className="mt-2 font-medium">{PLAY_COPY.me.del.irreversible}</p>
        <p role="alert" className="mt-2 text-small font-medium text-danger empty:hidden">
          {deleteError}
        </p>
        <div className="mt-5 flex flex-col gap-3 pb-2">
          <Button variant="danger" size="lg" block loading={deleting} onClick={() => void confirmDelete()} data-testid="delete-confirm">
            {deleting ? PLAY_COPY.me.del.working : PLAY_COPY.me.del.confirm}
          </Button>
          <Button variant="secondary" block disabled={deleting} onClick={() => setConfirmOpen(false)}>
            {PLAY_COPY.me.del.cancel}
          </Button>
        </div>
      </Sheet>
    </Frame>
  );
}
