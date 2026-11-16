"use client";
// /join/[code] (UX §3.2): the "ticket". Show title, host, players, a name box with a dice re-roll and
// one big "I'm in". Landing -> typing an idea stays at three taps: code, "I'm in", the idea box.
import { ArrowRight, Dices, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState, type FormEvent, type ReactNode } from "react";
import type { RoomInfoRes } from "@/lib/api/contracts";
import { Button, ButtonLink } from "@/components/ui/Button";
import { cn } from "@/components/ui/cn";
import { JoinCodeForm } from "@/components/ui/JoinCodeForm";
import { Pill } from "@/components/ui/Pill";
import { Skeleton } from "@/components/ui/Skeleton";
import { getRoom, joinRoom } from "@/lib/client/api";
import { ensureSession, getStoredName } from "@/lib/client/session";
import { COPY, friendlyError, randomName } from "@/lib/copy";
import { getStoredLang, storeLang } from "./hooks";
import { shortLang } from "./logic";
import { PLAY_COPY } from "./playCopy";

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

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="stage-light flex min-h-dvh flex-col">
      <header className="mx-auto flex w-full max-w-md items-center px-4 py-4">
        <Link href="/" className="inline-flex min-h-11 items-center gap-2 font-display text-xl font-extrabold tracking-tight">
          <svg width="26" height="26" viewBox="0 0 28 28" aria-hidden="true">
            <circle cx="8" cy="9" r="5.5" fill="var(--opt-a)" />
            <circle cx="20" cy="9" r="5.5" fill="var(--opt-b)" />
            <circle cx="14" cy="20" r="5.5" fill="var(--opt-c)" />
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

function Notice({ title, body, children, emoji }: { title: string; body: string; children?: ReactNode; emoji: string }) {
  return (
    <section aria-labelledby="notice-title" className="rounded-card border border-line bg-surface p-6 text-center">
      <p aria-hidden="true" className="text-4xl">
        {emoji}
      </p>
      <h1 id="notice-title" className="mt-3 font-display text-3xl leading-tight">
        {title}
      </h1>
      <p className="mt-2 text-muted">{body}</p>
      {children ? <div className="mt-5 flex flex-col gap-3">{children}</div> : null}
    </section>
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
    /* eslint-disable react-hooks/set-state-in-effect */
    setName(getStoredName() ?? randomName());
    setLang(shortLang(getStoredLang()));
    setCookieHint(typeof navigator !== "undefined" && navigator.cookieEnabled === false);
    /* eslint-enable react-hooks/set-state-in-effect */
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

  return (
    <section aria-labelledby="join-title" className="relative overflow-hidden rounded-card border border-line bg-surface">
      <div className="p-5 pb-6">
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm text-muted">{PLAY_COPY.join.admit}</p>
          <p aria-label={`Show code ${code.split("").join(" ")}`} className="font-display text-lg leading-none font-extrabold tracking-[0.18em] text-accent">
            {code}
          </p>
        </div>
        <h1 id="join-title" className="mt-2 font-display text-[34px] leading-[1.04] break-words">
          {room.title}
        </h1>
        <p className="mt-2 text-muted">{PLAY_COPY.join.hostedBy(room.hostName)}</p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Pill>
            <Users aria-hidden="true" className="size-4" />
            <span data-testid="join-players">{PLAY_COPY.join.playersIn(room.players)}</span>
          </Pill>
          <Pill tone={inProgress ? "accent" : "neutral"}>{inProgress ? "Live now" : PLAY_COPY.join.startingSoon}</Pill>
          {room.isDemo ? <Pill tone="wild">{PLAY_COPY.join.demo}</Pill> : null}
        </div>
        {inProgress ? <p className="mt-3 text-sm text-muted">{PLAY_COPY.join.inProgress}</p> : null}
      </div>

      {/* perforation with the two ticket notches */}
      <div
        aria-hidden="true"
        className={cn(
          "relative border-t-2 border-dashed border-line",
          "before:absolute before:-top-3 before:-left-3 before:size-6 before:rounded-full before:border before:border-line before:bg-bg before:content-['']",
          "after:absolute after:-top-3 after:-right-3 after:size-6 after:rounded-full after:border after:border-line after:bg-bg after:content-['']",
        )}
      />

      {cookiesBlocked ? (
        <div className="p-5 pt-6" role="alert">
          <h2 className="font-display text-2xl">{PLAY_COPY.join.cookies.title}</h2>
          <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-[15px] text-text/90">
            {PLAY_COPY.join.cookies.steps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
          <p className="mt-3 text-sm text-muted">{PLAY_COPY.join.cookies.note}</p>
          <Button className="mt-4" size="lg" block onClick={go} data-testid="keep-playing">
            {PLAY_COPY.join.cookies.keep}
            <ArrowRight aria-hidden="true" className="size-5" />
          </Button>
        </div>
      ) : (
        <form onSubmit={submit} noValidate className="p-5 pt-6">
          <label htmlFor={nameId} className="block text-sm font-medium">
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
              className={cn(
                "h-14 min-w-0 flex-1 rounded-card border bg-surface-2 px-4 text-lg font-medium text-text placeholder:text-muted focus:outline-none",
                error ? "border-danger" : "border-line focus:border-accent",
              )}
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
              className="grid size-14 shrink-0 place-items-center rounded-card border border-line bg-surface-2 text-accent transition-[transform,border-color] duration-150 hover:border-accent active:rotate-12 active:scale-95 motion-reduce:transition-none motion-reduce:active:transform-none"
            >
              <Dices aria-hidden="true" className="size-6" />
            </button>
          </div>
          <p id={`${nameId}-hint`} className="mt-2 text-sm text-muted">
            {PLAY_COPY.join.nameHint}
          </p>
          <p role="alert" className="mt-2 text-sm font-medium text-danger empty:hidden">
            {error}
          </p>

          {multilingual ? (
            <div className="mt-4">
              <label htmlFor={langId} className="block text-sm font-medium">
                {PLAY_COPY.join.langLabel}
              </label>
              <select
                id={langId}
                data-testid="lang-select"
                value={lang}
                onChange={(e) => setLang(e.target.value)}
                className="mt-2 h-12 w-full rounded-card border border-line bg-surface-2 px-3 text-base text-text focus:border-accent focus:outline-none"
              >
                {LANGUAGES.some((l) => l.code === lang) ? null : <option value={lang}>{lang.toUpperCase()}</option>}
                {LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.label}
                  </option>
                ))}
              </select>
              <p className="mt-1.5 text-sm text-muted">{PLAY_COPY.join.langHint}</p>
            </div>
          ) : null}

          {cookieHint ? (
            <p className="mt-4 rounded-[12px] border border-warn/50 bg-surface-2 p-3 text-sm text-text/90">{COPY.states.cookiesBlocked.body}</p>
          ) : null}

          <Button type="submit" size="lg" block loading={busy} className="mt-5" data-testid="join-submit">
            {busy ? PLAY_COPY.join.joining : PLAY_COPY.join.submit}
            {busy ? null : <ArrowRight aria-hidden="true" className="size-5" />}
          </Button>
        </form>
      )}
    </section>
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
        <div role="status" className="rounded-card border border-line bg-surface p-5">
          <span className="sr-only">{PLAY_COPY.join.loading}</span>
          <Skeleton className="h-4 w-24" />
          <Skeleton className="mt-4 h-10 w-4/5" />
          <Skeleton className="mt-3 h-4 w-1/2" />
          <Skeleton className="mt-8 h-14 w-full" />
          <Skeleton className="mt-4 h-14 w-full rounded-pill" />
        </div>
      </Shell>
    );
  }

  if (info.status === "missing") {
    return (
      <Shell>
        <Notice emoji="🔎" title={PLAY_COPY.join.invalid.title} body={PLAY_COPY.join.invalid.body}>
          <JoinCodeForm />
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
        <Notice emoji="📡" title={COPY.states.unreachable.title} body={info.message}>
          <Button onClick={() => { setInfo({ status: "loading" }); setAttempt((n) => n + 1); }}>{COPY.states.error.action}</Button>
        </Notice>
      </Shell>
    );
  }

  const { room } = info;

  if (room.phase === "ENDED") {
    return (
      <Shell>
        <Notice emoji="🎬" title={PLAY_COPY.join.ended.title} body={PLAY_COPY.join.ended.body}>
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
        <Notice emoji="🎟️" title={PLAY_COPY.join.full.title} body={PLAY_COPY.join.full.body}>
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
