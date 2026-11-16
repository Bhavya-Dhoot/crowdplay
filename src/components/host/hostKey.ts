// The host key proves "I created this show". It travels in the host link (?k=KEY) and is also kept
// per room code in sessionStorage + localStorage, so reopening /host/CODE in the same browser works.
// Every storage call is guarded: private windows and blocked storage must not break the console.
export type KeyStore = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const PREFIX = "cp_host_key_";
const nameFor = (code: string) => `${PREFIX}${code.toUpperCase()}`;

/** sessionStorage first (this tab), then localStorage (survives closing the tab). */
export function browserKeyStores(): KeyStore[] {
  const out: KeyStore[] = [];
  for (const pick of [() => window.sessionStorage, () => window.localStorage]) {
    try {
      out.push(pick());
    } catch {
      /* storage blocked */
    }
  }
  return out;
}

export function saveHostKey(code: string, key: string, stores: KeyStore[] = browserKeyStores()): void {
  for (const s of stores) {
    try {
      s.setItem(nameFor(code), key);
    } catch {
      /* quota or blocked: the URL still carries the key */
    }
  }
}

export function loadHostKey(code: string, stores: KeyStore[] = browserKeyStores()): string | null {
  for (const s of stores) {
    try {
      const k = s.getItem(nameFor(code));
      if (k && k.trim()) return k;
    } catch {
      /* try the next store */
    }
  }
  return null;
}

/** The key in the URL wins; otherwise whatever this browser remembered for the room. */
export function resolveHostKey(urlKey: string | null | undefined, code: string, stores: KeyStore[] = browserKeyStores()): string | null {
  const fromUrl = urlKey?.trim();
  return fromUrl ? fromUrl : loadHostKey(code, stores);
}

export function hostPath(code: string, key: string): string {
  return `/host/${code}?k=${encodeURIComponent(key)}`;
}
