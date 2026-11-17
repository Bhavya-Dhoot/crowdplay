"use client";
// JoinCodeForm: the "Join a show" form. CodeInput + Join button; Enter or the button goes to /join/CODE.
// An incomplete code gets an inline message instead of a dead button.
//   <JoinCodeForm />                       secondary (paper) Join button, for views that already have a gold primary
//   <JoinCodeForm variant="primary" />     when joining IS the one primary action of the view (404)
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { COPY } from "@/lib/copy";
import { Button, type ButtonVariant } from "./Button";
import { CodeInput } from "./CodeInput";

const LENGTH = 5;

export function JoinCodeForm({ variant = "secondary" }: { variant?: ButtonVariant }) {
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
    <form onSubmit={submit} noValidate className="space-y-3">
      <CodeInput
        value={code}
        label={COPY.landing.join.codeLabel}
        invalid={error !== null}
        onChange={(v) => {
          setCode(v);
          setError(null);
        }}
      />
      <p role="alert" className="text-center text-small text-danger empty:hidden">
        {error}
      </p>
      <Button type="submit" size="lg" variant={variant} block>
        {COPY.landing.join.button}
      </Button>
    </form>
  );
}
