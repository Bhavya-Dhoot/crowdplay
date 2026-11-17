// "@priya, @sam 🤖 + 23 others": names always come from the database; bots always carry the 🤖 badge.
import type { Credit } from "@/lib/realtime/types";
import { BotBadge } from "@/components/ui/BotBadge";

export function Credits({ credit, more }: { credit: readonly Credit[]; more: number }) {
  const extra = Math.max(0, Math.floor(more));
  if (credit.length === 0 && extra === 0) return null;
  return (
    <>
      {credit.map((c, i) => (
        <span key={`${c.name}-${i}`}>
          {i > 0 ? ", " : ""}
          <span className="font-display">@{c.name}</span>
          {c.bot ? (
            <>
              {" "}
              <BotBadge />
            </>
          ) : null}
        </span>
      ))}
      {extra > 0 ? (credit.length > 0 ? ` + ${extra} ${extra === 1 ? "other" : "others"}` : `${extra} ${extra === 1 ? "person" : "people"}`) : null}
    </>
  );
}
