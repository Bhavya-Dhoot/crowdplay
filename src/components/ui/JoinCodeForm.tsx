"use client";
// JoinCodeForm: the "Join a show" form. CodeInput + Join button.
//   <JoinCodeForm />                       secondary (paper) Join button, for views that already have a gold primary
//   <JoinCodeForm variant="primary" />     when joining IS the one primary action of the view (404)
//   <JoinCodeForm initialCode="ABCDE" />   pre-filled (the "we can't find that show" page keeps what was typed)
// The 5th letter submits by itself (after 180 ms, so the last tile visibly lands and a quick correction still works).
// It first asks the server whether the show exists: a wrong code stays in the boxes, shakes, buzzes and says so in words
// instead of navigating to an error page. If the check is slow (1.5 s) or fails for another reason it just goes on to
// /join/CODE, which handles every case itself. An incomplete code gets an inline message instead of a dead button.
import { TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { getRoom } from "@/lib/client/api";
import { COPY } from "@/lib/copy";
import { Button, type ButtonVariant } from "./Button";
import { CodeInput } from "./CodeInput";
import { haptic } from "./motionTokens";

const LENGTH = 5;
const AUTO_SUBMIT_MS = 180;
const CHECK_MS = 1500;

const clean = (s: string): string => s.replace(/[^a-zA-Z]/g, "").toUpperCase().slice(0, LENGTH);

export function JoinCodeForm({ variant = "secondary", initialCode = "" }: { variant?: ButtonVariant; initialCode?: string }) {
  const router = useRouter();
  const [code, setCode] = useState(() => clean(initialCode));
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const busy = useRef(false);

  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  function shake() {
    haptic("reject");
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    boxRef.current?.animate(
      [{ transform: "none" }, { transform: "translateX(-6px)" }, { transform: "translateX(6px)" }, { transform: "translateX(-4px)" }, { transform: "translateX(4px)" }, { transform: "none" }],
      { duration: 320, easing: "cubic-bezier(0.24, 1, 0.4, 1)" },
    );
  }

  async function go(value: string) {
    if (busy.current) return;
    busy.current = true;
    setChecking(true);
    setError(null);
    const found = await Promise.race([getRoom(value), new Promise<null>((resolve) => setTimeout(() => resolve(null), CHECK_MS))]);
    if (found && !found.ok && (found.code === "NOT_FOUND" || found.code === "ROOM_NOT_FOUND")) {
      busy.current = false;
      setChecking(false);
      setError(`No show has the code ${value}. Check the letters with the host.`);
      shake();
      return;
    }
    router.push(`/join/${value}`);
    busy.current = false;
    setChecking(false);
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (timer.current) clearTimeout(timer.current);
    if (code.length < LENGTH) {
      setError(`The code has ${LENGTH} letters. Check with the host.`);
      shake();
      return;
    }
    void go(code);
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-3">
      <div ref={boxRef}>
        <CodeInput
          value={code}
          label={COPY.landing.join.codeLabel}
          invalid={error !== null}
          onChange={(v) => {
            if (timer.current) clearTimeout(timer.current);
            setCode(v);
            setError(null);
          }}
          onComplete={(v) => {
            if (timer.current) clearTimeout(timer.current);
            timer.current = setTimeout(() => void go(v), AUTO_SUBMIT_MS);
          }}
        />
      </div>
      <p role="alert" className="flex items-start justify-center gap-1.5 text-center text-small font-medium text-danger empty:hidden">
        {error ? <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" /> : null}
        {error}
      </p>
      <Button type="submit" size="lg" variant={variant} block loading={checking}>
        {COPY.landing.join.button}
      </Button>
    </form>
  );
}
