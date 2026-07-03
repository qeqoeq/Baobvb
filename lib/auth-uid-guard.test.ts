import { execSync } from 'child_process';
import { describe, it, expect } from 'vitest';
import { resolve } from 'path';

// Guard: side_a_user_id / side_b_user_id must not appear in any client-side
// .select() or query in lib/ or app/. Auth UIDs of counterparts are computed
// server-side via auth.uid() (get_my_reveal_state RPC) and must never reach
// the client. This test fails immediately if the leak is re-introduced.
describe('auth UID client-side exposure guard', () => {
  it('G1: side_a_user_id / side_b_user_id not used in lib/ or app/ client code', () => {
    const root = resolve(__dirname, '..');
    let output = '';
    try {
      output = execSync(
        `grep -rn "side_a_user_id\\|side_b_user_id" --include="*.ts" --include="*.tsx" lib/ app/`,
        { cwd: root, encoding: 'utf8' },
      );
    } catch {
      // grep exits with code 1 when no matches found — that's the success case.
      output = '';
    }

    const violations = output
      .split('\n')
      .filter(Boolean)
      .filter((line) => {
        // Type definitions — not client usage.
        if (line.includes('reveal-shared-types.ts')) return false;
        // Test files may reference column names as string literals in assertions.
        if (line.includes('.test.ts')) return false;
        // Pure comment lines (// or * prefix after the line number).
        if (/^[^:]+:\d+:\s*\/\//.test(line)) return false;
        if (/^[^:]+:\d+:\s*\*/.test(line)) return false;
        return true;
      });

    expect(violations).toEqual([]);
  });
});
