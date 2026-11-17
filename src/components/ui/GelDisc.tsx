// GelDisc: the v2 name of <LetterBadge>, kept so pages compile until they move to LetterBadge (removed in the
// dead-code sweep). The gel colours are gone: the badge is an ink letter in a hand-drawn blob.
//   <GelDisc letter="A|B|C" size={40} />
import { gelOf, LetterBadge, type OptionLetter } from "./LetterBadge";

export type { OptionLetter };
export { gelOf };
export const GelDisc = LetterBadge;
