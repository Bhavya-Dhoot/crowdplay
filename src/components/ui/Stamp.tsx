// Stamp: the v2 name of <Ribbon>, kept so pages compile until they move to Ribbon (removed in the dead-code sweep).
//   <Stamp kind="canon|wildcard|narrator" size="sm|md|lg|xl" animate delayMs className />   (same props as Ribbon)
import { Ribbon, type RibbonKind } from "./Ribbon";

export type StampKind = Exclude<RibbonKind, "demo">;

export const Stamp = Ribbon;
