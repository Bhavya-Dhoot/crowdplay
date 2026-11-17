"use client";
// STORM / DISTILL body: the scene note on top and the live idea feed under it. Only the feed scrolls.
// Ideas are paper notes with a small seeded tilt (from the idea's key, so it never changes between renders): someone
// else's sit left with their name above them (bots wear the 🤖 badge), mine sit right with the yellow edge and, once
// they are sent, a pen check that draws itself on the note. A pending or refused idea says so on the note itself. The
// feed memoizes (stable props), so typing never re-renders it, and it renders the newest 100 ideas only. Its scroller
// ends 36 px under the dock, so notes slide behind the paper bar.
import { ArrowDown, ChevronDown, LoaderCircle, RotateCcw, TriangleAlert } from "lucide-react";
import { memo, useCallback, useLayoutEffect, useRef, useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { BotBadge } from "@/components/ui/BotBadge";
import { Button } from "@/components/ui/Button";
import { cn } from "@/components/ui/cn";
import { FatArrow } from "@/components/ui/FatArrow";
import { PaperCard, paperCardClass } from "@/components/ui/PaperCard";
import { PenCheck } from "@/components/ui/PenCheck";
import { Pill } from "@/components/ui/Pill";
import type { FeedIdea } from "@/lib/client/store";
import { useReducedMotion } from "@/lib/client/useReducedMotion";
import { friendlyError } from "@/lib/copy";
import { nearBottom } from "./logic";
import { PLAY_COPY } from "./playCopy";

const RENDER_CAP = 100;

// ---------- scene note ----------

export function PromptStrip({ title, text, ideas, compact }: { title: string; text: string; ideas: number; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const panelId = "scene-text";
  // With the keyboard up there is little height to spare: keep just the title row until the player expands it.
  const slim = Boolean(compact) && !open;
  return (
    <div className="relative z-10 shrink-0 px-0.5 pt-0.5">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        className={paperCardClass({
          pressable: true,
          className: cn("flex w-full gap-3 rounded-element px-3.5 py-2.5 text-left shadow-slip", slim ? "min-h-11 items-center" : "min-h-[64px] items-start"),
        })}
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate font-display text-body leading-6">{title}</span>
          <span id={panelId} className={cn("text-body leading-5 text-ink-notes", slim ? "hidden" : open ? "block" : "line-clamp-2")}>
            {text}
          </span>
        </span>
        <span className={cn("flex shrink-0 items-center gap-1.5", slim ? "flex-row" : "flex-col items-end")}>
          <Pill size="sm" className="tabular-nums" aria-label={PLAY_COPY.play.storm.ideasCount(ideas)}>
            {ideas}
          </Pill>
          <ChevronDown aria-hidden="true" className={cn("size-4 text-ink-notes transition-transform duration-175 motion-reduce:transition-none", open && "rotate-180")} />
        </span>
      </button>
    </div>
  );
}

// ---------- one idea ----------

type ItemProps = { idea: FeedIdea; fresh: boolean; onEdit: (text: string) => void };

const NOTE = "rounded-element px-3.5 py-2.5 text-body leading-snug break-words";

const FeedItem = memo(function FeedItem({ idea, fresh, onEdit }: ItemProps) {
  const rejected = idea.status === "rejected";
  const pending = idea.status === "pending";
  if (idea.mine) {
    return (
      <li data-testid="feed-item" data-mine="1" data-status={idea.status} className="flex flex-col items-end gap-2">
        <PaperCard
          seed={idea.key}
          edge={rejected ? undefined : "gold"}
          className={cn("flex max-w-[88%] items-end gap-2", NOTE, fresh && "placed", rejected && "border-danger", pending && "border-dashed")}
        >
          <span className="min-w-0 flex-1">{idea.text}</span>
          {idea.status === "sent" ? (
            <>
              <PenCheck size={20} seed={idea.key} className="mb-0.5" />
              <span className="sr-only">{PLAY_COPY.play.storm.sent}</span>
            </>
          ) : null}
        </PaperCard>
        {pending ? (
          <span className="flex items-center gap-1.5 pr-1 text-fine text-ink-notes">
            <LoaderCircle aria-hidden="true" className="size-3.5 animate-spin motion-reduce:animate-none" />
            {PLAY_COPY.play.storm.sending}
          </span>
        ) : null}
        {rejected ? (
          <span className="flex max-w-[88%] flex-col items-end gap-1 pr-1 text-right">
            <span className="flex items-start gap-1.5 text-body leading-snug text-danger">
              <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              {friendlyError(idea.rejectCode ?? "BAD_REQUEST")}
            </span>
            <Button variant="secondary" size="sm" onClick={() => onEdit(idea.text)}>
              <RotateCcw aria-hidden="true" className="size-4" />
              {PLAY_COPY.play.storm.tryAgain}
            </Button>
          </span>
        ) : null}
      </li>
    );
  }
  return (
    <li data-testid="feed-item" data-status={idea.status} className="flex items-end gap-2">
      <Avatar name={idea.name} size={32} className="mb-1" />
      <div className="min-w-0 max-w-[86%]">
        <p className="mb-1 flex items-center gap-1.5 pl-1 text-fine leading-5 text-ink-notes">
          <span className="truncate">{idea.name}</span>
          {idea.isBot ? <BotBadge /> : null}
        </p>
        <PaperCard seed={idea.key} className={cn(NOTE, "shadow-slip", fresh && "placed")}>
          {idea.text}
        </PaperCard>
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
    ? { title: storm.closedTitle, body: storm.closedBody, arrow: false }
    : ideasInRound > 0
      ? { title: storm.rollingTitle, body: storm.rollingBody, arrow: false }
      : { title: storm.emptyTitle, body: storm.emptyBody, arrow: true };
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
        // Wider than the column by 12 px each side: a tilted note and its marker shadow reach past the text edge.
        className={cn("-mx-3 h-full overflow-y-auto overscroll-contain px-3 pt-2 pb-[var(--dock-pad,8px)] transition-opacity duration-300 motion-reduce:transition-none", dim && "opacity-60")}
      >
        {shown.length === 0 ? (
          <div className="grid h-full min-h-[160px] place-items-center pb-6 text-center">
            <div className="flex max-w-[28ch] flex-col items-center gap-2 rounded-card border-2 border-dashed border-ink-faint px-5 py-5">
              <p className="font-display text-lead leading-tight">{empty.title}</p>
              <p className="text-body text-ink-notes">{empty.body}</p>
              {empty.arrow ? <FatArrow direction="down" size={34} seed="storm-empty" delayMs={500} className="mt-1" /> : null}
            </div>
          </div>
        ) : (
          <ul className="flex min-h-full flex-col justify-end gap-4">
            {shown.map((idea) => (
              <FeedItem key={idea.key} idea={idea} fresh={idea.at > mountedAt} onEdit={onEdit} />
            ))}
          </ul>
        )}
      </div>
      {unseen > 0 ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-12 flex justify-center">
          <Button
            variant="secondary"
            size="sm"
            className="pointer-events-auto"
            onClick={() => {
              stick.current = true;
              setUnseen(0);
              toBottom(true);
            }}
          >
            <ArrowDown aria-hidden="true" className="size-4" />
            {PLAY_COPY.play.storm.newIdeas}
          </Button>
        </div>
      ) : null}
    </div>
  );
});
