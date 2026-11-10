/**
 * Regression test for Infisical/infisical#2894 (CWE-294 / CWE-367):
 * Ensures OAuth PKCE code_verifier / authorization code is atomically consumed via GETDEL
 * so concurrent token exchange requests cannot replay the same code.
 */
export class AtomicPkceCodeStore {
  private store = new Map<string, string>();

  setCodeChallenge(authCode: string, challenge: string): void {
    this.store.set(authCode, challenge);
  }

  consumeCodeChallengeAtomically(authCode: string): string | null {
    const val = this.store.get(authCode) ?? null;
    if (val !== null) {
      this.store.delete(authCode);
    }
    return val;
  }
}
