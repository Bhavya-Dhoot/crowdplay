"use client";
// /me (UX §3.7): my receipts (CANON and BALLOT, grouped by show), my numbers, and "Delete my data"
// behind a confirm sheet. Handles: loading, no session, empty list, offline.
import { Sparkles, Trophy } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import type { MeRes } from "@/lib/api/contracts";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { cn } from "@/components/ui/cn";
import { Footer } from "@/components/ui/Footer";
import { Pill } from "@/components/ui/Pill";
import { Sheet } from "@/components/ui/Sheet";
import { Skeleton } from "@/components/ui/Skeleton";
import { deleteMyData, getMe } from "@/lib/client/api";
import { clearSession } from "@/lib/client/session";
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

function Frame({ children }: { children: ReactNode }) {
  return (
    <div className="stage-light flex min-h-dvh flex-col">
      <header className="mx-auto flex w-full max-w-2xl items-center px-4 py-4">
        <Link href="/" className="inline-flex min-h-11 items-center gap-2 font-display text-xl font-extrabold tracking-tight">
          <svg width="26" height="26" viewBox="0 0 28 28" aria-hidden="true">
            <circle cx="8" cy="9" r="5.5" fill="var(--opt-a)" />
            <circle cx="20" cy="9" r="5.5" fill="var(--opt-b)" />
            <circle cx="14" cy="20" r="5.5" fill="var(--opt-c)" />
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

function Stat({ value, label, accent }: { value: number; label: string; accent?: boolean }) {
  return (
    <div className={cn("rounded-card border bg-surface px-3 py-3.5", accent && value > 0 ? "border-accent" : "border-line")}>
      <p className={cn("font-display text-3xl leading-none font-extrabold tabular-nums", accent && value > 0 && "text-accent")}>{value}</p>
      <p className="mt-1.5 text-sm text-muted">{label}</p>
    </div>
  );
}

function Message({ emoji, title, body, children }: { emoji: string; title: string; body: string; children?: ReactNode }) {
  return (
    <section className="rounded-card border border-line bg-surface p-6 text-center">
      <p aria-hidden="true" className="text-4xl">
        {emoji}
      </p>
      <h1 className="mt-3 font-display text-3xl leading-tight">{title}</h1>
      <p className="mx-auto mt-2 max-w-[44ch] text-muted">{body}</p>
      {children ? <div className="mt-5 flex flex-col items-center gap-3">{children}</div> : null}
    </section>
  );
}

export function MeView() {
  const [view, setView] = useState<View>({ kind: "loading" });
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    void getMe().then((r) => {
      if (!alive) return;
      if (r.ok) setView({ kind: "ready", me: r });
      else if (r.code === "NO_SESSION") setView({ kind: "nosession" });
      else setView({ kind: "error", message: r.message });
    });
    return () => {
      alive = false;
    };
  }, [attempt]);

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
    setView({ kind: "deleted" });
  }

  if (view.kind === "loading") {
    return (
      <Frame>
        <div role="status" className="space-y-4">
          <span className="sr-only">Loading your receipts…</span>
          <Skeleton className="h-10 w-2/3" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-[84px] rounded-card" />
            ))}
          </div>
          <Skeleton className="h-28 w-full rounded-card" />
          <Skeleton className="h-28 w-full rounded-card" />
        </div>
      </Frame>
    );
  }

  if (view.kind === "nosession") {
    return (
      <Frame>
        <Message emoji="🎟️" title={PLAY_COPY.me.noSessionTitle} body={PLAY_COPY.me.noSessionBody}>
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
        <Message emoji="📡" title={COPY.states.unreachable.title} body={view.message}>
          <Button
            onClick={() => {
              setView({ kind: "loading" });
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
        <Message emoji="🧹" title={PLAY_COPY.me.del.doneTitle} body={PLAY_COPY.me.del.doneBody}>
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
      <h1 className="font-display text-4xl leading-tight">{PLAY_COPY.me.title}</h1>
      <p className="mt-1 text-muted">
        {me.user.displayName}. {PLAY_COPY.me.sub}
      </p>

      <div data-testid="me-stats" className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat value={me.stats.ideas} label={PLAY_COPY.me.stats.ideas} />
        <Stat value={me.stats.ballots} label={PLAY_COPY.me.stats.ballots} />
        <Stat value={me.stats.canon} label={PLAY_COPY.me.stats.canon} accent />
        <Stat value={me.stats.shows} label={PLAY_COPY.me.stats.shows} />
      </div>

      {groups.length === 0 ? (
        <div className="mt-6">
          <Message emoji="✨" title={PLAY_COPY.me.emptyTitle} body={PLAY_COPY.me.emptyBody}>
            <ButtonLink href="/" size="lg">
              {PLAY_COPY.me.emptyAction}
            </ButtonLink>
          </Message>
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          {groups.map((g) => (
            <section key={g.showId} aria-labelledby={`show-${g.showId}`}>
              <div className="flex items-baseline justify-between gap-3">
                <h2 id={`show-${g.showId}`} className="min-w-0 truncate font-display text-xl">
                  {g.items[0].showTitle}
                </h2>
                <Link
                  href={`/story/${g.showId}`}
                  className="inline-flex min-h-11 shrink-0 items-center text-sm font-semibold text-accent underline-offset-4 hover:underline"
                >
                  {PLAY_COPY.me.readStory}
                </Link>
              </div>
              <ul className="mt-1 space-y-3">
                {g.items.map((rc) => (
                  <li key={rc.id}>
                    <Card tone={rc.type === "CANON" ? "accent" : "default"} as="article" data-testid="receipt" data-type={rc.type} className="p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        {rc.type === "CANON" ? (
                          <Pill tone="accent" size="sm">
                            <Trophy aria-hidden="true" className="size-3.5" />
                            {PLAY_COPY.me.canon}
                          </Pill>
                        ) : (
                          <Pill size="sm">
                            <Sparkles aria-hidden="true" className="size-3.5 text-accent" />
                            {PLAY_COPY.me.ballot}
                          </Pill>
                        )}
                        <span className="text-sm text-muted">{PLAY_COPY.me.round(rc.roundNo)}</span>
                      </div>
                      <blockquote className="mt-2.5 text-lg leading-snug break-words">“{rc.ideaText}”</blockquote>
                      <p className="mt-2 text-sm text-muted">
                        {rc.type === "CANON" ? "Became canon as" : "Fed option"} <span className="text-text">{rc.optionLabel}</span>
                      </p>
                    </Card>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      <div className="mt-10 border-t border-line pt-6">
        <Button variant="secondary" data-testid="delete-data" onClick={() => setConfirmOpen(true)}>
          {PLAY_COPY.me.del.open}
        </Button>
      </div>

      <Sheet open={confirmOpen} onClose={() => (deleting ? undefined : setConfirmOpen(false))} title={PLAY_COPY.me.del.title}>
        <p className="text-text/90">{PLAY_COPY.me.del.body}</p>
        <p className="mt-2 font-medium">{PLAY_COPY.me.del.irreversible}</p>
        <p role="alert" className="mt-2 text-sm font-medium text-danger empty:hidden">
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
