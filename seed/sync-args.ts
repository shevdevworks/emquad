/**
 * Pure argument parsing for seed/gallery-sync.ts. No imports on purpose -
 * this must be safely importable on its own (by a throwaway test script,
 * or anything else) without pulling in lib/db or touching the network.
 */
export type SyncMode =
  | { readonly kind: 'plan' }
  | { readonly kind: 'apply' }
  | { readonly kind: 'error'; readonly message: string };

export function parseSyncArgs(argv: readonly string[]): SyncMode {
  if (argv.length === 0) return { kind: 'plan' };
  if (argv.length === 1 && argv[0] === '--apply') return { kind: 'apply' };
  return { kind: 'error', message: `unrecognized arguments: ${argv.join(' ')}` };
}
