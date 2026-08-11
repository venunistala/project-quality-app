/**
 * Escapes literal `%`, `_`, and `\` in user input before it's embedded in an
 * ILIKE pattern. Postgres treats `%`/`_` as wildcards and `\` as its escape
 * character by default - without this, a search term containing one of
 * those characters would match unintended rows (a correctness bug, not an
 * injection risk, since the value is still passed as a bound parameter).
 */
export function escapeLikePattern(input: string): string {
  return input.replace(/[\\%_]/g, (match) => `\\${match}`);
}
