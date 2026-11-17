"use client";
// /join/[code] (UX §3.2, design-v3): the "admit one" ticket, a paper note with an ink outline: the show title, host and
// players on the main part, a dashed tear line with scissors, then the stub with the name box (dice re-roll) and the
// language choice. The one yellow key, "I'm in", sits on the page under the ticket. Landing -> typing an idea stays at
// three taps: code, "I'm in", the idea box.
import { ArrowRight, Clapperboard, Dices, Scissors, Search, Ticket as TicketIcon, TriangleAlert, Users, WifiOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState, type FormEvent, type ReactNode } from "react";
import type { RoomInfoRes } from "@/lib/api/contracts";
import { Banner } from "@/components/ui/Banner";
import { Button, ButtonLink } from "@/components/ui/Button";
import { cn } from "@/components/ui/cn";
import { JoinCodeForm } from "@/components/ui/JoinCodeForm";
import { PaperCard } from "@/components/ui/PaperCard";
import { PenLoop } from "@/components/ui/PenLoop";
import { Pill } from "@/components/ui/Pill";
import { Ribbon } from "@/components/ui/Ribbon";
import { Skeleton } from "@/components/ui/Skeleton";
import { StageBackdrop } from "@/components/ui/StageBackdrop";
import { getRoom, joinRoom } from "@/lib/client/api";
import { ensureSession, getStoredName } from "@/lib/client/session";
import { COPY, friendlyError, randomName } from "@/lib/copy";
import { BrandLink } from "./BrandLink";
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

const FIELD = "h-14 min-w-0 rounded-element border-2 bg-paper px-4 text-lead text-ink placeholder:text-ink-notes";

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <StageBackdrop />
      <header className="mx-auto flex w-full max-w-md items-center px-4 py-3">
        <BrandLink />
      </header>
      <main id="main" className="mx-auto w-full max-w-md flex-1 px-4 pt-3 pb-12">
        {children}
      </main>
    </div>
  );
}

function Notice({ title, body, children, icon }: { title: string; body: string; children?: ReactNode; icon: ReactNode }) {
  return (
    <PaperCard as="section" aria-labelledby="notice-title" tilt={-0.6} className="rounded-card p-6 text-center">
      <span aria-hidden="true" className="slip mx-auto grid size-14 place-items-center rounded-blob">
        {icon}
      </span>
      <h1 id="notice-title" className="mt-4 text-h2 leading-tight">
        {title}
      </h1>
      <p className="mt-2 text-body text-ink-notes">{body}</p>
      {children ? <div className="mt-5 flex flex-col gap-3">{children}</div> : null}
    </PaperCard>
  );
}

/** The dashed line you tear along, with a small pair of scissors at its left end. */
function TearLine() {
  return (
    <div aria-hidden="true" className="relative mx-3 border-t-2 border-dashed border-ink">
      <Scissors className="absolute -top-3 -left-1 size-5 bg-paper-raised pr-0.5 text-ink" />
    </div>
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
    <section aria-labelledby="join-title" className="px-5 pt-6 pb-6">
      <div className="flex items-center justify-between gap-3">
        <Banner size="sm" play className="-ml-2">
          {PLAY_COPY.join.admit}
        </Banner>
        <PenLoop seed={code} className="mr-3 ml-3">
          <span aria-label={`Show code ${code.split("").join(" ")}`} className="block px-2 py-2.5 font-display text-h3 leading-none tracking-[0.16em]">
            {code}
          </span>
        </PenLoop>
      </div>
      <h1 id="join-title" className="mt-5 text-h1 leading-[1.06] break-words">
        {room.title}
      </h1>
      <p className="mt-2 text-body text-ink-notes">{PLAY_COPY.join.hostedBy(room.hostName)}</p>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Pill>
          <Users aria-hidden="true" className="size-4" />
          <span data-testid="join-players">{PLAY_COPY.join.playersIn(room.players)}</span>
        </Pill>
        <Pill>{inProgress ? "Live now" : PLAY_COPY.join.startingSoon}</Pill>
        {room.isDemo ? <Ribbon kind="demo" size="sm" /> : null}
      </div>
      {room.isDemo ? <p className="mt-2 text-fine text-ink-notes">{PLAY_COPY.join.demo}</p> : null}
      {inProgress ? <p className="mt-3 text-body text-ink-notes">{PLAY_COPY.join.inProgress}</p> : null}
    </section>
  );

  if (cookiesBlocked) {
    return (
      <>
        <PaperCard className="shadow-poster rounded-card">
          {main}
          <TearLine />
          <div role="alert" className="px-5 pt-6 pb-5">
            <h2 className="font-display text-h3">{PLAY_COPY.join.cookies.title}</h2>
            <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-body">
              {PLAY_COPY.join.cookies.steps.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
            <p className="mt-3 text-body text-ink-notes">{PLAY_COPY.join.cookies.note}</p>
          </div>
        </PaperCard>
        <Button className="mt-7" size="lg" block onClick={go} data-testid="keep-playing">
          {PLAY_COPY.join.cookies.keep}
          <ArrowRight aria-hidden="true" className="size-5" />
        </Button>
      </>
    );
  }

  return (
    <form onSubmit={submit} noValidate>
      <PaperCard className="shadow-poster rounded-card">
        {main}
        <TearLine />
        <div className="px-5 pt-6 pb-5">
          <label htmlFor={nameId} className="block font-display text-body">
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
              className={cn(FIELD, "flex-1", error ? "border-danger" : "border-ink")}
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
              className="press grid size-14 shrink-0 place-items-center rounded-element border-2 border-ink bg-paper-raised text-ink"
            >
              <Dices aria-hidden="true" className="size-6" />
            </button>
          </div>
          <p id={`${nameId}-hint`} className="mt-2 text-body text-ink-notes">
            {PLAY_COPY.join.nameHint}
          </p>
          {error ? (
            <p role="alert" className="mt-2 flex items-start gap-1.5 text-body text-danger">
              <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              {error}
            </p>
          ) : null}

          {multilingual ? (
            <div className="mt-4">
              <label htmlFor={langId} className="block font-display text-body">
                {PLAY_COPY.join.langLabel}
              </label>
              <select
                id={langId}
                data-testid="lang-select"
                value={lang}
                onChange={(e) => setLang(e.target.value)}
                className="mt-2 h-12 w-full rounded-element border-2 border-ink bg-paper px-3 text-body text-ink"
              >
                {LANGUAGES.some((l) => l.code === lang) ? null : <option value={lang}>{lang.toUpperCase()}</option>}
                {LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.label}
                  </option>
                ))}
              </select>
              <p className="mt-1.5 text-body text-ink-notes">{PLAY_COPY.join.langHint}</p>
            </div>
          ) : null}

          {cookieHint ? <p className="mt-4 rounded-element border-2 border-dashed border-ink-faint bg-paper p-3 text-body text-ink">{COPY.states.cookiesBlocked.body}</p> : null}
        </div>
      </PaperCard>

      <Button type="submit" size="lg" block loading={busy} className="mt-7" data-testid="join-submit">
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
          <Skeleton className="h-[220px] rounded-card" />
          <Skeleton className="mt-7 h-14 w-full rounded-pill" />
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
