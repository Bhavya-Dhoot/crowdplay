"use client";
// JoinCodeForm: the landing page's "Join a show" form. CodeInput + Join button; Enter or the
// button goes to /join/CODE. An incomplete code gets an inline message instead of a dead button.
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { COPY } from "@/lib/copy";
import { Button } from "./Button";
import { CodeInput } from "./CodeInput";

const LENGTH = 5;

export function JoinCodeForm() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (code.length < LENGTH) {
      setError(`The code has ${LENGTH} letters. Check with the host.`);
      return;
    }
    router.push(`/join/${code}`);
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <CodeInput
        value={code}
        label={COPY.landing.join.codeLabel}
        invalid={error !== null}
        onChange={(v) => {
          setCode(v);
          setError(null);
        }}
      />
      <p role="alert" className="text-center text-sm text-danger empty:hidden">
        {error}
      </p>
      <Button type="submit" size="lg" block>
        {COPY.landing.join.button}
      </Button>
    </form>
  );
}
