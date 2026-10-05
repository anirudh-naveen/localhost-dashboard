/** Join argv into a command line that a POSIX shell will split back into the same args. */
export function shellQuote(args: string[]): string {
  return args.map((a) => (a === "" ? "''" : /^[\w@%+=:,./-]+$/.test(a) ? a : `'${a.replace(/'/g, `'\\''`)}'`)).join(" ");
}
