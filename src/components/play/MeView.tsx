"use client";
// /me (UX §3.7, design-v3): a notebook page of my receipts (CANON and BALLOT, grouped by show) with my numbers and
// "Delete my data" behind a confirm sheet. The page is ruled paper with spiral rings; each receipt is a small slip on it,
// canon ones with the yellow edge and the yellow marker under "Canon". Handles: loading, no session, empty list, offline.
// A visitor who never joined a show has no session token: the page says so without calling /api/me, so a first visit
// never logs a red 401 (audit #20). Only when the browser blocks storage (so we cannot tell) does it ask the server.
import { Ticket, Trash2, WandSparkles, WifiOff } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import type { MeRes } from "@/lib/api/contracts";
import { Banner } from "@/components/ui/Banner";
import { Button, ButtonLink } from "@/components/ui/Button";
import { cn } from "@/components/ui/cn";
import { tiltOf } from "@/components/ui/doodle";
import { Footer } from "@/components/ui/Footer";
import { InkUnderline } from "@/components/ui/InkUnderline";
import { PaperCard } from "@/components/ui/PaperCard";
import { PenCheck } from "@/components/ui/PenCheck";
import { Sheet } from "@/components/ui/Sheet";
import { Skeleton } from "@/components/ui/Skeleton";
import { StageBackdrop } from "@/components/ui/StageBackdrop";
import { Swash } from "@/components/ui/Swash";
import { deleteMyData, getMe, getStoredToken } from "@/lib/client/api";
import { clearSession, getSession } from "@/lib/client/session";
import { COPY } from "@/lib/copy";
import { BrandLink } from "./BrandLink";
import { groupByShow } from "./logic";
import { PLAY_COPY } from "./playCopy";
import styles from "./play.module.css";

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
      <StageBackdrop />
      <header className="mx-auto flex w-full max-w-2xl items-center px-4 py-3">
        <BrandLink />
      </header>
      <main id="main" className="mx-auto w-full max-w-2xl flex-1 px-4 pt-6 pb-12">
        {children}
      </main>
      <Footer />
    </div>
  );
}

function Stat({ value, label, canon }: { value: number; label: string; canon?: boolean }) {
  return (
    <div className="rounded-element border-2 border-ink bg-paper-raised px-3 py-3 text-center">
      <p className="font-display text-h2 leading-none tabular-nums">{canon && value > 0 ? <Swash>{value}</Swash> : value}</p>
      <p className="mt-2 text-body text-ink-notes">{label}</p>
    </div>
  );
}

function Message({ icon, title, body, children }: { icon: ReactNode; title: string; body: string; children?: ReactNode }) {
  return (
    <PaperCard as="section" tilt={-0.6} className="rounded-card p-6 text-center">
      <span aria-hidden="true" className="slip mx-auto grid size-14 place-items-center rounded-blob">
        {icon}
      </span>
      <h1 className="mt-4 text-h2 leading-tight">{title}</h1>
      <p className="mx-auto mt-2 max-w-[44ch] text-body text-ink-notes">{body}</p>
      {children ? <div className="mt-5 flex flex-col items-center gap-3">{children}</div> : null}
    </PaperCard>
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
          <Skeleton className="h-28 w-full rounded-card" />
          <Skeleton className="h-28 w-full rounded-card" />
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
      <PaperCard as="div" className={cn("shadow-poster rounded-card px-4 pt-10 pb-6 sm:px-7", styles.notebook)}>
        <div className="flex flex-col items-start gap-3">
          <h1>
            <Banner size="lg" play className="-ml-1 [--b-px:24] sm:[--b-px:28]">
              {PLAY_COPY.me.title}
            </Banner>
          </h1>
          <p className="max-w-[40ch] text-body text-ink-notes">
            {me.user.displayName}. {PLAY_COPY.me.sub}
          </p>
        </div>

        <div data-testid="me-stats" className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat value={me.stats.ideas} label={PLAY_COPY.me.stats.ideas} />
          <Stat value={me.stats.ballots} label={PLAY_COPY.me.stats.ballots} />
          <Stat value={me.stats.canon} label={PLAY_COPY.me.stats.canon} canon />
          <Stat value={me.stats.shows} label={PLAY_COPY.me.stats.shows} />
        </div>

        {groups.length === 0 ? (
          <div className="mt-8">
            <Message icon={<WandSparkles className="size-7" />} title={PLAY_COPY.me.emptyTitle} body={PLAY_COPY.me.emptyBody}>
              <ButtonLink href="/" size="lg">
                {PLAY_COPY.me.emptyAction}
              </ButtonLink>
            </Message>
          </div>
        ) : (
          <div className="mt-9 space-y-9">
            {groups.map((g) => (
              <section key={g.showId} aria-labelledby={`show-${g.showId}`}>
                <div className="flex items-baseline justify-between gap-3">
                  <h2 id={`show-${g.showId}`} className="min-w-0 truncate font-display text-h3">
                    {g.items[0].showTitle}
                  </h2>
                  <Link href={`/story/${g.showId}`} className="inline-flex min-h-11 shrink-0 items-center font-display text-body text-ink">
                    <InkUnderline play={false} seed={g.showId}>
                      {PLAY_COPY.me.readStory}
                    </InkUnderline>
                  </Link>
                </div>
                <ul className="mt-3 space-y-5">
                  {g.items.map((rc) => (
                    <li key={rc.id}>
                      <PaperCard
                        as="article"
                        tilt={tiltOf(rc.id, 1)}
                        edge={rc.type === "CANON" ? "gold" : undefined}
                        data-testid="receipt"
                        data-type={rc.type}
                        className={cn("rounded-element px-4 py-3.5", rc.type === "BALLOT" && "shadow-slip")}
                      >
                        <p className="flex items-center gap-2 font-display text-body leading-none">
                          {rc.type === "CANON" ? <Swash>{PLAY_COPY.me.canon}</Swash> : <PenCheck size={18} play={false} seed={rc.id} />}
                          {rc.type === "BALLOT" ? <span>{PLAY_COPY.me.ballot}</span> : null}
                          <span className="font-sans text-fine text-ink-notes">{PLAY_COPY.me.round(rc.roundNo)}</span>
                        </p>
                        <blockquote className="mt-2 text-lead leading-[1.35] break-words">“{rc.ideaText}”</blockquote>
                        <p className="mt-2 text-body text-ink-notes">
                          {rc.type === "CANON" ? "Became canon as" : "Fed option"} <span className="text-ink">{rc.optionLabel}</span>
                        </p>
                      </PaperCard>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}

        <div className="mt-10 border-t-2 border-dashed border-ink-faint pt-6">
          <Button variant="secondary" data-testid="delete-data" onClick={() => setConfirmOpen(true)}>
            {PLAY_COPY.me.del.open}
          </Button>
        </div>
      </PaperCard>

      <Sheet open={confirmOpen} onClose={() => (deleting ? undefined : setConfirmOpen(false))} title={PLAY_COPY.me.del.title}>
        <p className="text-body text-ink">{PLAY_COPY.me.del.body}</p>
        <p className="mt-2 font-display text-body">{PLAY_COPY.me.del.irreversible}</p>
        <p role="alert" className="mt-2 text-body text-danger empty:hidden">
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
