"use client";
// STORM / DISTILL body: the scene strip on top and the live idea feed under it. Only the feed scrolls.
// Ideas are paper index cards: someone else's sit left with their name on the stage above them (bots wear the 🤖
// badge), mine sit right with a gold edge, land with the spring and keep a small check once they are sent. A pending
// or refused idea says so on the card itself. The feed memoizes (stable props), so typing never re-renders it, and it
// renders the newest 100 ideas only. Its scroller ends 36 px under the dock's glass bar, so ideas slide behind it.
import { ArrowDown, Check, ChevronDown, LoaderCircle, MessageSquareText, RotateCcw, TriangleAlert } from "lucide-react";
import { memo, useCallback, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { BotBadge } from "@/components/ui/BotBadge";
import { cn } from "@/components/ui/cn";
import { SPRING, springToLinear } from "@/components/ui/motionTokens";
import { PaperCard } from "@/components/ui/PaperCard";
import type { FeedIdea } from "@/lib/client/store";
import { useReducedMotion } from "@/lib/client/useReducedMotion";
import { friendlyError } from "@/lib/copy";
import { nearBottom } from "./logic";
import { PLAY_COPY } from "./playCopy";
import styles from "./play.module.css";

const RENDER_CAP = 100;
const LAND = springToLinear(SPRING.land.stiffness, SPRING.land.damping);
const LAND_STYLE = { "--land-ease": LAND.easing, "--land-ms": `${LAND.durationMs}ms` } as CSSProperties;

// ---------- scene strip ----------

export function PromptStrip({ title, text, ideas, compact }: { title: string; text: string; ideas: number; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const panelId = "scene-text";
  // With the keyboard up there is little height to spare: keep just the title row until the player expands it.
  const slim = Boolean(compact) && !open;
  return (
    <div className="relative z-10 shrink-0">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "press flex w-full gap-3 rounded-card border border-stage-line bg-stage-1 px-3.5 py-2.5 text-left [--press-overlay:rgb(255_255_255/0.06)]",
          slim ? "min-h-11 items-center" : "min-h-[64px] items-start",
        )}
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate font-script text-body leading-6 font-semibold text-on-stage">{title}</span>
          <span id={panelId} className={cn("font-script text-small leading-5 text-muted-on-stage", slim ? "hidden" : open ? "block" : "line-clamp-2")}>
            {text}
          </span>
        </span>
        <span className={cn("flex shrink-0 items-center gap-1.5", slim ? "flex-row" : "flex-col items-end")}>
          <span className="rounded-pill bg-stage-2 px-2 py-0.5 text-fine font-semibold tabular-nums text-on-stage" aria-label={PLAY_COPY.play.storm.ideasCount(ideas)}>
            {ideas}
          </span>
          <ChevronDown aria-hidden="true" className={cn("size-4 text-muted-on-stage transition-transform duration-175 motion-reduce:transition-none", open && "rotate-180")} />
        </span>
      </button>
    </div>
  );
}

// ---------- one idea ----------

type ItemProps = { idea: FeedIdea; fresh: boolean; onEdit: (text: string) => void };

const FeedItem = memo(function FeedItem({ idea, fresh, onEdit }: ItemProps) {
  const rejected = idea.status === "rejected";
  const pending = idea.status === "pending";
  if (idea.mine) {
    return (
      <li
        data-testid="feed-item"
        data-mine="1"
        data-status={idea.status}
        className={cn("flex flex-col items-end gap-1", fresh && styles.ideaMine)}
        style={fresh ? LAND_STYLE : undefined}
      >
        <PaperCard
          edge={rejected ? undefined : "gold"}
          className={cn(
            "flex max-w-[88%] items-end gap-2 rounded-[16px] rounded-br-[4px] px-3.5 py-2.5 text-small leading-snug break-words",
            rejected && "outline-2 -outline-offset-2 outline-danger-on-paper",
            pending && "opacity-80",
          )}
        >
          <span className="min-w-0 flex-1">{idea.text}</span>
          {idea.status === "sent" ? (
            <>
              <Check aria-hidden="true" className="mb-0.5 size-3.5 shrink-0 text-ink-muted" strokeWidth={3} />
              <span className="sr-only">{PLAY_COPY.play.storm.sent}</span>
            </>
          ) : null}
        </PaperCard>
        {pending ? (
          <span className="flex items-center gap-1.5 pr-1 text-fine text-muted-on-stage">
            <LoaderCircle aria-hidden="true" className="size-3.5 animate-spin motion-reduce:animate-none" />
            {PLAY_COPY.play.storm.sending}
          </span>
        ) : null}
        {rejected ? (
          <span className="flex max-w-[88%] flex-col items-end gap-0.5 pr-1 text-right">
            <span className="flex items-start gap-1.5 text-small leading-snug font-semibold text-danger">
              <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              {friendlyError(idea.rejectCode ?? "BAD_REQUEST")}
            </span>
            <button
              type="button"
              onClick={() => onEdit(idea.text)}
              className="press -mr-2 inline-flex min-h-11 items-center gap-1.5 rounded-pill px-3 text-small font-semibold text-on-stage [--press-overlay:rgb(255_255_255/0.1)]"
            >
              <RotateCcw aria-hidden="true" className="size-4" />
              {PLAY_COPY.play.storm.tryAgain}
            </button>
          </span>
        ) : null}
      </li>
    );
  }
  return (
    <li data-testid="feed-item" data-status={idea.status} className={cn("flex items-end gap-2", fresh && styles.ideaIn)}>
      <Avatar name={idea.name} size={28} className="mb-0.5" />
      <div className="min-w-0 max-w-[88%]">
        <p className="mb-0.5 flex items-center gap-1.5 pl-1 text-fine leading-5 text-muted-on-stage">
          <span className="truncate">{idea.name}</span>
          {idea.isBot ? <BotBadge /> : null}
        </p>
        <PaperCard className="rounded-[16px] rounded-bl-[4px] px-3.5 py-2.5 text-small leading-snug break-words">{idea.text}</PaperCard>
      </div>
    </li>
  );
});

// ---------- the feed ----------

type FeedProps = { feed: FeedIdea[]; onEdit: (text: string) => void; dim?: boolean; closed?: boolean; ideasInRound?: number };

export const IdeaFeed = memo(function IdeaFeed({ feed, onEdit, dim, closed, ideasInRound = 0 }: FeedProps) {
  const { storm } = PLAY_COPY.play;
  // An empty feed says what is true: nothing yet, ideas on their way (late join), or the storm is over.
  const empty = closed
    ? { title: storm.closedTitle, body: storm.closedBody }
    : ideasInRound > 0
      ? { title: storm.rollingTitle, body: storm.rollingBody }
      : { title: storm.emptyTitle, body: storm.emptyBody };
  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const [mountedAt] = useState(() => Date.now());
  const lastLen = useRef(0);
  const reduced = useReducedMotion();
  const [unseen, setUnseen] = useState(0);
  const shown = feed.length > RENDER_CAP ? feed.slice(-RENDER_CAP) : feed;

  const toBottom = useCallback(
    (smooth: boolean) => {
      const el = scroller.current;
      if (!el) return;
      el.scrollTo({ top: el.scrollHeight, behavior: smooth && !reduced ? "smooth" : "auto" });
    },
    [reduced],
  );

  // The feed grew because of an external event (a message arrived): syncing the scroll and the badge is the point.
  useLayoutEffect(() => {
    const grew = feed.length - lastLen.current;
    lastLen.current = feed.length;
    if (grew <= 0) return;
    const last = feed[feed.length - 1];
    if (stick.current || last?.mine) {
      toBottom(lastLen.current > grew);
      setUnseen(0);
    } else {
      setUnseen((n) => n + grew);
    }
  }, [feed, toBottom]);

  function onScroll() {
    const el = scroller.current;
    if (!el) return;
    const near = nearBottom(el.scrollTop, el.clientHeight, el.scrollHeight);
    stick.current = near;
    if (near) setUnseen(0);
  }

  return (
    <div className="relative min-h-0 flex-1">
      <div
        ref={scroller}
        onScroll={onScroll}
        tabIndex={0}
        role="region"
        aria-label="Ideas from the room"
        className={cn("h-full overflow-y-auto overscroll-contain rounded-card px-0.5 pt-1 pb-[var(--dock-pad,8px)] transition-opacity duration-300 motion-reduce:transition-none", dim && "opacity-60")}
      >
        {shown.length === 0 ? (
          <div className="grid h-full min-h-[160px] place-items-center pb-6 text-center">
            <div className="flex max-w-[26ch] flex-col items-center gap-2">
              <MessageSquareText aria-hidden="true" className="size-8 text-muted-on-stage" />
              <p className="font-display text-lead leading-tight font-bold">{empty.title}</p>
              <p className="text-small text-muted-on-stage">{empty.body}</p>
            </div>
          </div>
        ) : (
          <ul className="flex min-h-full flex-col justify-end gap-2.5">
            {shown.map((idea) => (
              <FeedItem key={idea.key} idea={idea} fresh={idea.at > mountedAt} onEdit={onEdit} />
            ))}
          </ul>
        )}
      </div>
      {unseen > 0 ? (
        <button
          type="button"
          onClick={() => {
            stick.current = true;
            setUnseen(0);
            toBottom(true);
          }}
          className="press absolute bottom-12 left-1/2 inline-flex min-h-11 -translate-x-1/2 items-center gap-1.5 rounded-pill bg-paper px-4 text-small font-semibold text-ink shadow-contact"
        >
          <ArrowDown aria-hidden="true" className="size-4" />
          {PLAY_COPY.play.storm.newIdeas}
        </button>
      ) : null}
    </div>
  );
});
