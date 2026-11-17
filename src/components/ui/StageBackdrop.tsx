// StageBackdrop: the page. Render it once per page. The dot-grid paper itself is on <html> (see globals.css), so it
// scrolls with the notes and needs no layer; this adds the one static grain layer on top of the paper (under 4 percent,
// an inline SVG, no image request). Server-safe: no hooks, no effect.
//   <StageBackdrop />
// `roundNo`, `breathe` and `hue`-style props from design v2 are accepted and ignored so old call sites keep compiling
// (the dead-code sweep removes them). For the OBS overlay do not render it: the page sets html and body transparent.
type Props = { roundNo?: number | null; breathe?: boolean };

export function StageBackdrop(_props: Props) {
  return <div aria-hidden="true" className="page-grain" />;
}
