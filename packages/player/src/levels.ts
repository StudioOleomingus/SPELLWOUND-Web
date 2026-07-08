import type { Puzzle } from "@spellwound/core";
import { validatePuzzle } from "@spellwound/core";
import tutorial01 from "../../../levels/tutorial-01.json";
import tutorial02 from "../../../levels/tutorial-02.json";
import tutorial03 from "../../../levels/tutorial-03.json";
import level04 from "../../../levels/level-04.json";
import level05 from "../../../levels/level-05.json";

const raw = [
  tutorial01,
  tutorial02,
  tutorial03,
  level04,
  level05,
] as unknown as Puzzle[];

/** Bundled official levels (tutorials first), schema-validated at load time. */
export const levels: Puzzle[] = raw.map((p) => {
  const errors = validatePuzzle(p);
  if (errors.length > 0) {
    throw new Error(`Invalid puzzle "${p.id}":\n${errors.join("\n")}`);
  }
  return p;
});
