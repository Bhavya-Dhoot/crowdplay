# Design sources for the CROWDPLAY polish pass (2026-11-17)

Read-only extraction; nothing installed or run. Both repos exist and are non-empty. Labels: **[V]** a number or rule stated in the source; **[I]** my inference, verify before relying on it. Apple's HIG wording is Apple's, so it is paraphrased here.

---

## 1. dickwu/apple-design-skill (exists; 140 files)

**What it is.** An agent *review* skill, not a style kit. `SKILL.md` is a five-lens audit procedure (accessibility, platform, visual craft, interaction, writing). `references/hig/*.md` mirrors 123 Apple HIG pages, plus a curated `liquid-glass.md` and a `cross-platform.md` that translates Apple terms to web/Flutter/RN.
**Gap to know first:** the HIG gives no spring, duration, easing, corner-radius or spacing-grid numbers. Motion and shape guidance is qualitative. Get those numbers from section 2.

**Type** [V `typography.md`]
- Default 17 pt, minimum 11 pt on mobile (13 / 10 on macOS). Prefer Regular, Medium, Semibold, Bold. Avoid Ultralight, Thin and Light, especially small.
- iOS "Large (default)" ramp, size/leading pt: Large Title 34/41, Title 1 28/34, Title 2 22/28, Title 3 20/25 (emphasis Semibold), Headline 17/22 Semibold, Body 17/22, Callout 16/21, Subhead 15/20, Footnote 13/18, Caption 1 12/16, Caption 2 11/13.
- Hierarchy comes from weight, size and colour. Use few typefaces. When text scales, enlarge the content people care about, not every label. A rounded system variant exists for soft UIs.

**Layout and targets** [V `accessibility.md`, `buttons.md`, `layout.md`]
- Hit region at least 44x44 pt (absolute minimum 28x28). About 12 pt padding around bezeled controls, about 24 pt around bezel-less ones.
- Order by importance, align to scan, indent for subordination, group with space or separators, disclose progressively. Layout follows available space (size classes), never the device model.
- One or two prominent buttons per view. Separate the preferred choice by style, not size. Every custom button needs a press state.
- Heritage note [V `heritage.md`]: older advice to put key controls at the top is superseded. Put important controls mid-screen or low for thumb reach.

**Colour and dark mode** [V `color.md`, `dark-mode.md`, `accessibility.md`]
- Contrast: 4.5:1 text up to 17 pt, 3:1 for 18 pt+ or bold. Dark mode floor 4.5:1, aim for 7:1 on small custom text. Never convey meaning by colour alone.
- Semantic roles, not hard-coded hex. One colour means one thing. Test light, dark and increased contrast, plus bright and dim viewing.
- Dark uses two backgrounds, **base** (dimmer, recedes) and **elevated** (lighter, advances). Soften glaring white images. No in-app appearance toggle. A permanently dark UI is acceptable for immersive media.

**Material / glass** [V `liquid-glass.md`, curated]
- Two layers only. Content layer: opaque or standard materials, **no glass**. Functional layer (tab/tool bars, sheets, popovers) floating above content: glass allowed, few and small, never glass on glass.
- Regular = blurs and adjusts luminosity, for text-heavy surfaces. Clear = very translucent, only over rich media, with a 35% black dim layer when the media is bright (Apple's one published number).
- Web recipe (Apple says only the 35% is spec, the rest is "a practical starting point" [V]): `backdrop-filter: blur(24px) saturate(1.4)` plus translucent fill plus 1px translucent border. Regular blur 20-40 px, clear 8-16 px. Regular fill 60-80% opacity, clear 20-40%. Saturate 1.2-1.5.
- Fallbacks: `prefers-reduced-transparency` or `prefers-contrast: more` gives opaque fill and stronger borders. `prefers-reduced-motion` drops morphs. `backdrop-filter` over animating content is expensive.
- Colour on glass: labels stay monochrome, accent only on the primary action and status, colour the background (not the label) of the prominent button, check the resting scroll position.

**Motion and feedback** [V `motion.md`, `accessibility.md`, `feedback.md`, `playing-haptics.md`]
- Purposeful, brief, precise. Avoid motion on frequent interactions. Let people cancel it and never make them wait. Motion must be optional and never the sole carrier of meaning.
- Reduce Motion: tighten springs (less bounce), track gestures directly, avoid z-depth animation, replace x/y/z transitions with fades, avoid animating into or out of blur. Be cautious with fast blinking. Minimise timer-dismissed UI.
- Feedback in the interface, not alerts. Use several channels (colour, text, sound, haptics). Confirm only significant completions.
- Haptics: complement the visual, short and discrete, consistent cause-and-effect, easy to mute.

**Icons** [V `icons.md`, `sf-symbols.md`]: simple, one consistent weight and detail level, match the weight of adjacent text, vector (SVG), alt label on every custom icon, selected variant only if needed, no text inside icons unless essential.

**Anti-patterns / craft lens** [V `SKILL.md`]
- Three looks that signal a *template*: cream + high-contrast serif + terracotta; **near-black + one acid-green or vermilion accent**; broadsheet of hairlines, zero radius, dense columns. Also: a hero of big number over small label with gradient accent, and 01/02/03 markers on non-sequences. A palette needs a reason rooted in the product.
- Spend boldness in one signature element, everything else quiet. Remove one accessory. One orchestrated motion moment or none.
- Token plan: 4-6 named hex colours with roles, each with light/dark and a contrast figure. Fix order: accessibility, conventions, craft, polish.
- Superseded: bevel/gradient skeuomorphism, alert boxes as the default warning, fixed screen sizes.

**Mostly not applicable to web:** tab bars, sidebars, menu bar, iPhone Duo, Apple Pay, widgets, Live Activities.

---

## 2. meta/astryx (exists; ~14k files; MIT; React 19 + StyleX, Beta)

**What it is.** Meta's open design system: 150+ components, themes via CSS custom properties, usable with Tailwind or plain CSS. Authoritative design numbers live in three places: `packages/core/src/theme/tokens.stylex.ts`, `docs/design/*.md` (intent records, deliberately number-free) and the public **wiki "Design Conventions"** (not in the git tree; fetched from raw.githubusercontent.com/wiki/meta/astryx). Take the values, not the stack.

**Grid, size, shape** [V tokens.stylex.ts + wiki]
- 4 px grid, 2 px half-steps (`--spacing-N` = 0.25 rem x N, 0-12). Gaps must grow with grouping: label-to-field < fields < groups < sections. Smells: one gap everywhere (<=3 distinct values), child gap wider than parent, nested cards (group with space first).
- Fixed control heights 28 / 32 / 36. Keep a 44 px *touch* hit area even if the control looks compact. Under 20 px is a defect for a fine pointer.
- Radius by role: inner 4, element 8, container 12, page 28, chat 28, full 9999. Nested radius = parent radius minus the gap between them (12 px card, 8 px padding gives about 4 px). Roundness is one global dial, not per-element overrides.
- Smells: side-tab accent stripe on a rounded card (named an AI tell), thick accent border on a rounded corner.

**Type** [V]
- Base 14 px, ratio 1.2: 6, 7, 8, 10, 12, **14**, 17, 20, 24, 29, 35, 42 px. Weights 400 body, 500 label, 600 headings, 700 strong. Leading snaps to the 4 px grid (body 14/20, supporting 12/20, headings 24/32, 20/28, 17/24).
- Display 1-3 = 42 / 35 / 29 px at weight 400, leading about 1.24. Only for hero or data callouts, never body. Editorial preset base 16 ratio 1.25. Dense preset base 12 ratio 1.125.
- Smells: adjacent steps under 1.25x ratio (14/15/16 blur together), body leading under 1.3 (target 1.5), body under 12 px, measure over 75ch (target 65-75), body tracking over 0.05em, all-caps body, justified body, gradient text.
- Mobile rule: base = max(desktop base, 16 px) on `(width<1024px) and (pointer:coarse)`. Pins one heading size so display does not dominate. Never change the root font size.

**Colour / material / elevation** [V]
- Every token is a `light-dark()` pair; neutrals chosen by role (hover overlay, track, muted container, neutral element). No pure `#000` / `#fff`. Interaction overlays are alpha tints, never opaque fills (hover about 5%, pressed about 10% of ink; dark mode uses white).
- Dark scale sample: body `#111112`, surface `#1F1F22`, popover `#28292C` (higher = lighter), text `#DFE2E5` / `#AAAFB5` / disabled `#6F747C`, border `#F2F4F6` at 10%.
- Status = token plus icon plus text, never hue alone. Three tiers: muted (in-flow), solid (chip/toast), inverted temporal overlay (toast/tooltip). Content on status fills at 4.5:1 or better (note dark error uses dark text).
- Emphasis: one primary per action group ("every action emphasized" is a defect). Gray text on colour looks dead.
- Shadows: low `0 1px 1px, 0 2px 8px` @ .1 alpha; med `0 1px 2px, 0 2px 12px`; high `0 2px 2px, 0 8px 24px` (dark alpha .2-.3). No coloured glow. Do not stack hairline border plus wide diffuse shadow. Z-order: base < dropdown < sticky < modal < toast < tooltip. No magic z-index. Popovers must escape `overflow:hidden`.

**Motion** [V tokens.stylex.ts, wiki, `design/motion.md`, `design/reduced-motion.md`]
- Durations: fast 175 ms (130-230), medium 410 (310-550), slow 975 (730-1300), exit = fast. Small local feedback is faster than large entrances.
- Easing: arrivals and state changes `cubic-bezier(0.24, 1, 0.4, 1)` (ease-out-quart-ish). Exits `cubic-bezier(0.3, 0, 0.6, 0.6)`, accelerating away.
- Animate only transform and opacity. Layout-property animation is a defect. Bounce/elastic is flagged "dated and tacky", but a theme "character" may overshoot on entrances and moves only (design:motion DR3). Decorative motion (image hover scale/rotate) is a judgment-level defect.
- Reduced motion: touch gets an opacity-only cross-fade of at most 200 ms, mouse/keyboard gets an instant change. No travel, scale or spring. Colour and in-place value changes apply instantly. Momentum after a flick still coasts. No per-component opt-out.
- Hover-to-display (tooltips, hover cards): entry delay and exit guard, never on touch, instant on keyboard focus.
- Springs used for touch UI, taken from Apple docs or measured iOS 26.2 (`motion/uikit/springs.ts`), as response/dampingRatio: finger-tracking .15/.86, nav push/pop .3/1, switch thumb .3/1, menu open .32/.8, menu close .35/.85, sheet detent .344/1, slider lift .215/.6, slider drop .5/.7, SwiftUI smooth .5s bounce 0, snappy .5s bounce .15, bouncy .5s bounce .3. Alert/action sheet mass 1, stiffness 522.35, damping 45.71. Keyboard mass 1, stiffness 555, damping 47.1.
- Web conversion **[I]** (mass 1): stiffness = (2pi/response)^2, damping = 2 x zeta x sqrt(stiffness). So .3/1 is about 439/42, .32/.8 about 386/31, .5/.825 about 158/21. SwiftUI duration d, bounce b: zeta = 1-b, stiffness = (2pi/d)^2, so .5s/.15 is about 158/21.4 and .5s/.3 about 158/17.6.

**Feedback / states** [V]
- Press = `scale(0.98)` plus pressed overlay, painted with 0 ms onset. A tap released early still flashes about 100 ms. Release fades 175 ms (UIKit deselect measured 200 ms). A press never changes layout or hit area. No scale under reduced motion. Disabled surfaces show no press and give a reason.
- Focus (`:focus-visible` only): 2 px accent outline at 3 px offset; fields use border plus inset ring.
- Design every state: rest, hover, focus, active, disabled, loading, selected. Skeletons and spinners must keep dimensions (no layout shift). Reorder: dedicated handle, 50% opacity ghost, 2 px accent insertion line, no raised shadow, commit on drop.
- Icons: 12 / 16 / 20 / 24 px roles. Outlined by default, filled for on/selected, status and 12 px or smaller. Never rely on outline-to-fill alone. Decorative icons accompany text.

**Anti-pattern list** [V `principles.doc.mjs` + wiki]: hardcoded colour or spacing, inline styles, Card around every list item (dense data = rows), Badge as decoration, nested cards, side-tab accents, coloured glows, gradient text, bounce, untinted black/white, opaque hover fills, off-grid values, "Lorem ipsum / Item 1" mock data.

---

## Apply to CROWDPLAY (phones + 16:9 show screen + host console)

1. **Phone targets and type:** 44 px minimum targets, 12 px or more between vote buttons, body and inputs at 16-17 px (Apple 17 pt; Astryx 16 px mobile floor; stops iOS input zoom [I]), primary action in the lower half of the screen. FITS.
2. **Type system:** one family, weights 500-700 for UI, body never below 400. Use ratio 1.2 on phones and 1.25 on the show screen, leading at least 1.4. Big-screen body of 28-32 px or more at room distance is **[I]** (neither source covers 10-foot viewing). FITS, with that extension.
3. **Spacing/shape:** 4 px grid, three or four deliberate gap tiers, concentric radii. Playful = raise the roundness dial (container 16-20, pills for vote buttons) while keeping r_inner = r_outer - gap. FITS.
4. **Colour:** tinted near-black base with *lighter* elevated surfaces (Apple base/elevated; Astryx `#111112` / `#1F1F22` / `#28292C`), light text at 4.5:1 or better, UI at 3:1. Apple's skill names "near-black plus one acid accent" a template default, so CROWDPLAY needs a reason rooted in the show (stage-light hues per round or per idea) and one signature element. PARTIAL: dark fits, single-accent default is a risk.
5. **Glass/blur:** only on floating functional layers (host console bars, vote tray, sheets). Never on idea cards or the show canvas. Start at 24 px blur, saturate 1.4, opaque fallback for reduced-transparency or high-contrast. Avoid it over animating video on the show screen and on mid-range phones. FITS, restrained.
6. **Motion budget:** press 0 ms onset plus scale(0.98), vote confirm and chips 175 ms, phase changes on the show screen 410 ms, winner reveal 975 ms once. Only transform and opacity. Expressive overshoot allowed on arrivals only (Astryx design:motion DR3), e.g. spring about 158/18-21 **[I]**. Exits use the accelerating curve. PARTIAL: playful bounce is looser than Astryx's "tacky" line.
7. **Frequent actions stay still:** typing, scrolling and repeat voting get no flourish (Apple). No decorative hover motion. Cancellable transitions. FITS.
8. **Reduced motion and flashing:** honour `prefers-reduced-motion` on phones (touch: cross-fade at most 200 ms; no travel or springs). Give the host a "calm" switch for the show screen. Avoid strobing or fast blinking; keep under 3 flashes/s (WCAG 2.3.1, **[I]** not in either source). FITS.
9. **Feedback:** every vote or submit confirms in at least two channels (colour plus icon plus text, optional sound). Haptics are an enhancement only; web Vibration API support on iOS Safari is unreliable **[I]**, so never depend on it. Status is never colour alone. FITS.
10. **Countdowns:** Apple warns about timer-dismissed UI. Show time left as text plus a bar, announce via `aria-live`, never auto-dismiss errors or confirmations. PARTIAL: timed rounds are inherent to the game.
11. **Icons:** SVG, 16 / 20 / 24 px, outlined default, filled = selected or "vote cast", stroke weight matched to text, accessible names on all icon-only buttons. FITS.
12. **Do NOT adopt:** tab-bar/sidebar/menu-bar conventions (the flow is linear: join, type, vote), Astryx's 28-36 px dense control heights on phones (host console only), "Cards are widgets, dense data = rows" for the idea feed, or the StyleX/React stack (map values to CSS vars or the Tailwind theme). Apple's "no permanent dark" does not bind us: it allows an always-dark show screen. Fix order from Apple's improvement mode: accessibility, conventions, craft, polish.
