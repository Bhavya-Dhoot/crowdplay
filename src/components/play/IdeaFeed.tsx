"use client";
// STORM / DISTILL body: the scene strip on top and the live idea feed under it. Only the feed
// scrolls. Own ideas sit on the right with a gold outline; bots wear the 🤖 badge; pending and
// rejected ideas say so right under the bubble.
import { ArrowDown, ChevronDown, Clapperboard, MessageSquareText, RotateCcw } from "lucide-react";
import { memo, useCallback, useLayoutEffect, useRef, useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { BotBadge } from "@/components/ui/BotBadge";
import { cn } from "@/components/ui/cn";
import type { FeedIdea } from "@/lib/client/store";
import { useReducedMotion } from "@/lib/client/useReducedMotion";
import { friendlyError } from "@/lib/copy";
import { nearBottom } from "./logic";
import { PLAY_COPY } from "./playCopy";
import styles from "./play.module.css";

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
          "flex w-full gap-3 rounded-card border border-line bg-surface-2 p-3 text-left transition-colors hover:border-muted motion-reduce:transition-none",
          slim ? "min-h-11 items-center" : "min-h-[72px] items-start",
        )}
      >
        <Clapperboard aria-hidden="true" className={cn("size-5 shrink-0 text-accent", !slim && "mt-0.5")} />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-display text-base leading-6 font-bold">{title}</span>
          <span id={panelId} className={cn("text-sm leading-5 text-muted", slim ? "hidden" : open ? "block" : "line-clamp-2")}>
            {text}
          </span>
        </span>
        <span className={cn("flex shrink-0 items-end gap-1", slim ? "flex-row items-center" : "flex-col")}>
          <span className="rounded-pill bg-bg px-2 py-0.5 text-xs font-semibold tabular-nums text-accent" aria-label={PLAY_COPY.play.storm.ideasCount(ideas)}>
            {ideas}
          </span>
          <ChevronDown aria-hidden="true" className={cn("size-4 text-muted transition-transform duration-200 motion-reduce:transition-none", open && "rotate-180")} />
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
        className={cn("flex flex-col items-end gap-1", fresh && styles.ideaIn)}
      >
        <p
          className={cn(
            "max-w-[86%] rounded-[16px] rounded-br-[4px] border bg-surface px-3.5 py-2 text-[15px] leading-snug break-words",
            rejected ? "border-danger" : "border-accent shadow-[0_0_0_1px_var(--accent),0_8px_24px_-10px_rgb(255_210_63/0.45)]",
            pending && "opacity-70",
          )}
        >
          {idea.text}
        </p>
        {pending ? <span className="pr-1 text-xs text-muted">{PLAY_COPY.play.storm.sending}</span> : null}
        {rejected ? (
          <span className="flex max-w-[86%] flex-col items-end gap-0.5 pr-1 text-right">
            <span role="alert" className="text-xs font-medium text-danger">
              {friendlyError(idea.rejectCode ?? "BAD_REQUEST")}
            </span>
            <button
              type="button"
              onClick={() => onEdit(idea.text)}
              className="-mr-2 inline-flex min-h-11 items-center gap-1.5 rounded-pill px-3 text-xs font-semibold text-accent hover:bg-surface-2"
            >
              <RotateCcw aria-hidden="true" className="size-3.5" />
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
      <div className="min-w-0 max-w-[86%]">
        <p className="mb-0.5 flex items-center gap-1.5 pl-1 text-xs text-muted">
          <span className="truncate">{idea.name}</span>
          {idea.isBot ? <BotBadge /> : null}
        </p>
        <p className="rounded-[16px] rounded-bl-[4px] bg-surface-2 px-3.5 py-2 text-[15px] leading-snug break-words">{idea.text}</p>
      </div>
    </li>
  );
});

// ---------- the feed ----------

type FeedProps = { feed: FeedIdea[]; onEdit: (text: string) => void; dim?: boolean; closed?: boolean; ideasInRound?: number };

export function IdeaFeed({ feed, onEdit, dim, closed, ideasInRound = 0 }: FeedProps) {
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
        className={cn("h-full overflow-y-auto overscroll-contain rounded-card px-0.5 py-1 transition-opacity duration-300 motion-reduce:transition-none", dim && "opacity-60")}
      >
        {feed.length === 0 ? (
          <div className="grid h-full min-h-[160px] place-items-center text-center">
            <div className="flex max-w-[26ch] flex-col items-center gap-2">
              <MessageSquareText aria-hidden="true" className="size-8 text-muted" />
              <p className="font-display text-lg font-bold">{empty.title}</p>
              <p className="text-sm text-muted">{empty.body}</p>
            </div>
          </div>
        ) : (
          <ul className="flex min-h-full flex-col justify-end gap-2.5">
            {feed.map((idea) => (
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
          className="absolute bottom-2 left-1/2 inline-flex min-h-11 -translate-x-1/2 items-center gap-1.5 rounded-pill bg-accent px-4 text-sm font-semibold text-ink shadow-lg shadow-black/50"
        >
          <ArrowDown aria-hidden="true" className="size-4" />
          {PLAY_COPY.play.storm.newIdeas}
        </button>
      ) : null}
    </div>
  );
}
