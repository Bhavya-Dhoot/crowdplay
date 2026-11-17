"use client";
// /join/[code] (UX §3.2): the "ticket". A paper admit-one ticket on the stage: show title, host and players on the
// main part, a perforation with two punched notches, then the stub with the name box (dice re-roll) and the language
// choice. The gold "I'm in" sits on the stage under the ticket. Landing -> typing an idea stays at three taps:
// code, "I'm in", the idea box.
import { ArrowRight, Dices, Search, Ticket as TicketIcon, TriangleAlert, Users, WifiOff, Clapperboard } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState, type FormEvent, type ReactNode } from "react";
import type { RoomInfoRes } from "@/lib/api/contracts";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { cn } from "@/components/ui/cn";
import { JoinCodeForm } from "@/components/ui/JoinCodeForm";
import { Skeleton } from "@/components/ui/Skeleton";
import { StageBackdrop } from "@/components/ui/StageBackdrop";
import { getRoom, joinRoom } from "@/lib/client/api";
import { ensureSession, getStoredName } from "@/lib/client/session";
import { COPY, friendlyError, randomName } from "@/lib/copy";
import { getStoredLang, storeLang } from "./hooks";
import { shortLang } from "./logic";
import { PLAY_COPY } from "./playCopy";
import styles from "./play.module.css";

type Room = RoomInfoRes["room"];
type Info = { status: "loading" } | { status: "ok"; room: Room } | { status: "missing" } | { status: "error"; message: string };

const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "es", label: "Español" },
  { code: "fr", label: "Français" },
  { code: "de", label: "Deutsch" },
  { code: "pt", label: "Português" },
  { code: "it", label: "Italiano" },
  { code: "hi", label: "हिन्दी" },
  { code: "ar", label: "العربية" },
  { code: "ja", label: "日本語" },
  { code: "ko", label: "한국어" },
  { code: "zh", label: "中文" },
] as const;

const FIELD =
  "h-14 min-w-0 rounded-element border-2 bg-paper-2 px-4 text-lead font-medium text-ink placeholder:text-ink-muted focus:border-ink focus:outline-none";
const TAG = "inline-flex items-center gap-1.5 rounded-pill border border-paper-edge bg-paper-2 px-3 py-1.5 text-small font-semibold text-ink";

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <StageBackdrop roundNo={1} />
      <header className="mx-auto flex w-full max-w-md items-center px-4 py-3">
        <Link href="/" className="inline-flex min-h-11 items-center gap-2 font-display text-lead font-extrabold tracking-tight">
          <svg width="26" height="26" viewBox="0 0 28 28" aria-hidden="true">
            <circle cx="8" cy="9" r="5.5" fill="var(--gel-a)" />
            <circle cx="20" cy="9" r="5.5" fill="var(--gel-b)" />
            <circle cx="14" cy="20" r="5.5" fill="var(--gel-c)" />
          </svg>
          {COPY.brand}
        </Link>
      </header>
      <main id="main" className="mx-auto w-full max-w-md flex-1 px-4 pt-2 pb-12">
        {children}
      </main>
    </div>
  );
}

function Notice({ title, body, children, icon }: { title: string; body: string; children?: ReactNode; icon: ReactNode }) {
  return (
    <Card as="section" aria-labelledby="notice-title" className="p-6 text-center">
      <span aria-hidden="true" className="mx-auto grid size-14 place-items-center rounded-full bg-paper text-ink shadow-contact">
        {icon}
      </span>
      <h1 id="notice-title" className="mt-4 font-display text-h2 leading-tight">
        {title}
      </h1>
      <p className="mt-2 text-muted-on-stage">{body}</p>
      {children ? <div className="mt-5 flex flex-col gap-3">{children}</div> : null}
    </Card>
  );
}

function Ticket({ room, code, multilingual }: { room: Room; code: string; multilingual: boolean }) {
  const router = useRouter();
  const nameId = useId();
  const langId = useId();
  const [name, setName] = useState("");
  const [lang, setLang] = useState("en");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cookiesBlocked, setCookiesBlocked] = useState(false);
  const [cookieHint, setCookieHint] = useState(false);

  // Browser-only defaults (stored name, language) are read after mount so the server HTML stays stable.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setName(getStoredName() ?? randomName());
    setLang(shortLang(getStoredLang()));
    setCookieHint(typeof navigator !== "undefined" && navigator.cookieEnabled === false);
  }, []);

  const go = () => router.push(`/play/${code}`);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      setError(PLAY_COPY.join.nameTooShort);
      return;
    }
    setBusy(true);
    setError(null);
    const s = await ensureSession(trimmed);
    if (!s.ok) {
      setBusy(false);
      setError(friendlyError(s.code, s.message));
      return;
    }
    storeLang(lang);
    // Seat taken with the chosen language; /play joins again as a no-op. A full room is handled right here.
    const j = await joinRoom(code, lang);
    if (!j.ok && (j.code === "ROOM_FULL" || j.code === "BANNED")) {
      setBusy(false);
      setError(friendlyError(j.code, j.message));
      return;
    }
    if (s.session.cookiesBlocked) {
      setBusy(false);
      setCookiesBlocked(true);
      return;
    }
    go();
  }

  const inProgress = room.phase !== "LOBBY";

  const main = (
    <section aria-labelledby="join-title" data-surface="paper" className={cn("rounded-t-card bg-paper px-5 pt-5 pb-7 text-ink", styles.ticketTop)}>
      <div className="flex items-start justify-between gap-3">
        <p className="font-script text-small text-ink-muted italic">{PLAY_COPY.join.admit}</p>
        <p aria-label={`Show code ${code.split("").join(" ")}`} className="font-display text-lead leading-none font-extrabold tracking-[0.18em]">
          {code}
        </p>
      </div>
      <h1 id="join-title" className="mt-3 font-display text-[34px] leading-[1.04] break-words">
        {room.title}
      </h1>
      <p className="mt-2 text-ink-muted">{PLAY_COPY.join.hostedBy(room.hostName)}</p>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className={TAG}>
          <Users aria-hidden="true" className="size-4" />
          <span data-testid="join-players">{PLAY_COPY.join.playersIn(room.players)}</span>
        </span>
        <span className={TAG}>{inProgress ? "Live now" : PLAY_COPY.join.startingSoon}</span>
        {room.isDemo ? <span className={TAG}>{PLAY_COPY.join.demo}</span> : null}
      </div>
      {inProgress ? <p className="mt-3 text-small text-ink-muted">{PLAY_COPY.join.inProgress}</p> : null}
    </section>
  );

  if (cookiesBlocked) {
    return (
      <>
        <div className={styles.ticketWrap}>
          {main}
          <div data-surface="paper" role="alert" className={cn("rounded-b-card border-t-2 border-dashed border-paper-edge bg-paper px-5 pt-6 pb-5 text-ink", styles.ticketStub)}>
            <h2 className="font-display text-h3">{PLAY_COPY.join.cookies.title}</h2>
            <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-small">
              {PLAY_COPY.join.cookies.steps.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
            <p className="mt-3 text-small text-ink-muted">{PLAY_COPY.join.cookies.note}</p>
          </div>
        </div>
        <Button className="mt-5" size="lg" block onClick={go} data-testid="keep-playing">
          {PLAY_COPY.join.cookies.keep}
          <ArrowRight aria-hidden="true" className="size-5" />
        </Button>
      </>
    );
  }

  return (
    <form onSubmit={submit} noValidate>
      <div className={styles.ticketWrap}>
        {main}
        <div data-surface="paper" className={cn("rounded-b-card border-t-2 border-dashed border-paper-edge bg-paper px-5 pt-6 pb-5 text-ink", styles.ticketStub)}>
          <label htmlFor={nameId} className="block text-small font-semibold">
            {PLAY_COPY.join.nameLabel}
          </label>
          <div className="mt-2 flex gap-2">
            <input
              id={nameId}
              data-testid="name-input"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setError(null);
              }}
              minLength={2}
              maxLength={20}
              autoComplete="nickname"
              autoCapitalize="words"
              spellCheck={false}
              aria-describedby={`${nameId}-hint`}
              aria-invalid={error ? true : undefined}
              className={cn(FIELD, "flex-1", error ? "border-danger-on-paper" : "border-paper-edge")}
            />
            <button
              type="button"
              data-testid="reroll-name"
              aria-label={PLAY_COPY.join.reroll}
              title={PLAY_COPY.join.reroll}
              onClick={() => {
                setName(randomName());
                setError(null);
              }}
              className="press grid size-14 shrink-0 place-items-center rounded-element border-2 border-paper-edge bg-paper-2 text-ink"
            >
              <Dices aria-hidden="true" className="size-6" />
            </button>
          </div>
          <p id={`${nameId}-hint`} className="mt-2 text-small text-ink-muted">
            {PLAY_COPY.join.nameHint}
          </p>
          {error ? (
            <p role="alert" className="mt-2 flex items-start gap-1.5 text-small font-semibold text-danger-on-paper">
              <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              {error}
            </p>
          ) : null}

          {multilingual ? (
            <div className="mt-4">
              <label htmlFor={langId} className="block text-small font-semibold">
                {PLAY_COPY.join.langLabel}
              </label>
              <select
                id={langId}
                data-testid="lang-select"
                value={lang}
                onChange={(e) => setLang(e.target.value)}
                className="mt-2 h-12 w-full rounded-element border-2 border-paper-edge bg-paper-2 px-3 text-body text-ink focus:border-ink focus:outline-none"
              >
                {LANGUAGES.some((l) => l.code === lang) ? null : <option value={lang}>{lang.toUpperCase()}</option>}
                {LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.label}
                  </option>
                ))}
              </select>
              <p className="mt-1.5 text-small text-ink-muted">{PLAY_COPY.join.langHint}</p>
            </div>
          ) : null}

          {cookieHint ? <p className="mt-4 rounded-element border border-paper-edge bg-paper-2 p-3 text-small text-ink">{COPY.states.cookiesBlocked.body}</p> : null}
        </div>
      </div>

      <Button type="submit" size="lg" block loading={busy} className="mt-5" data-testid="join-submit">
        {busy ? PLAY_COPY.join.joining : PLAY_COPY.join.submit}
        {busy ? null : <ArrowRight aria-hidden="true" className="size-5" />}
      </Button>
    </form>
  );
}

export function JoinView({ code: rawCode, multilingual = false }: { code: string; multilingual?: boolean }) {
  const code = rawCode.toUpperCase();
  const [info, setInfo] = useState<Info>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    void getRoom(code).then((r) => {
      if (!alive) return;
      if (r.ok) setInfo({ status: "ok", room: r.room });
      else if (r.code === "NOT_FOUND" || r.code === "ROOM_NOT_FOUND") setInfo({ status: "missing" });
      else setInfo({ status: "error", message: friendlyError(r.code, r.message) });
    });
    return () => {
      alive = false;
    };
  }, [code, attempt]);

  if (info.status === "loading") {
    return (
      <Shell>
        <div role="status">
          <span className="sr-only">{PLAY_COPY.join.loading}</span>
          <Skeleton tone="paper" className="h-[212px] rounded-b-none rounded-t-card" />
          <Skeleton tone="paper" className="mt-1 h-[200px] rounded-t-none rounded-b-card" />
          <Skeleton className="mt-5 h-14 w-full rounded-pill" />
        </div>
      </Shell>
    );
  }

  if (info.status === "missing") {
    return (
      <Shell>
        <Notice icon={<Search className="size-7" />} title={PLAY_COPY.join.invalid.title} body={PLAY_COPY.join.invalid.body}>
          <JoinCodeForm variant="primary" initialCode={code} />
          <ButtonLink href="/" variant="ghost">
            {PLAY_COPY.join.invalid.home}
          </ButtonLink>
        </Notice>
      </Shell>
    );
  }

  if (info.status === "error") {
    return (
      <Shell>
        <Notice icon={<WifiOff className="size-7" />} title={COPY.states.unreachable.title} body={info.message}>
          <Button
            variant="secondary"
            onClick={() => {
              setInfo({ status: "loading" });
              setAttempt((n) => n + 1);
            }}
          >
            {COPY.states.error.action}
          </Button>
        </Notice>
      </Shell>
    );
  }

  const { room } = info;

  if (room.phase === "ENDED") {
    return (
      <Shell>
        <Notice icon={<Clapperboard className="size-7" />} title={PLAY_COPY.join.ended.title} body={PLAY_COPY.join.ended.body}>
          <ButtonLink href={`/story/${room.showId}`} size="lg" block>
            {PLAY_COPY.join.ended.action}
          </ButtonLink>
          <ButtonLink href="/" variant="ghost">
            {PLAY_COPY.join.invalid.home}
          </ButtonLink>
        </Notice>
      </Shell>
    );
  }

  if (room.full) {
    return (
      <Shell>
        <Notice icon={<TicketIcon className="size-7" />} title={PLAY_COPY.join.full.title} body={PLAY_COPY.join.full.body}>
          <ButtonLink href={`/screen/${code}`} size="lg" block>
            {PLAY_COPY.join.full.action}
          </ButtonLink>
          <ButtonLink href="/" variant="ghost">
            {PLAY_COPY.join.invalid.home}
          </ButtonLink>
        </Notice>
      </Shell>
    );
  }

  return (
    <Shell>
      <Ticket room={room} code={code} multilingual={multilingual} />
    </Shell>
  );
}
