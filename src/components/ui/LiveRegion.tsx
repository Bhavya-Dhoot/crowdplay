// LiveRegion: a visually hidden aria-live="polite" announcer for phase changes and results.
//   <LiveRegion message={phaseAnnouncement(state)} />
// Screen readers read the text whenever `message` changes. Keep one per screen, mounted early.
export function LiveRegion({ message }: { message: string }) {
  return (
    <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
      {message}
    </div>
  );
}
