import { selectGithubLoginEmail, TGithubEmail } from "./github";

const email = (overrides: Partial<TGithubEmail> & Pick<TGithubEmail, "email">): TGithubEmail => ({
  primary: false,
  verified: false,
  visibility: null,
  ...overrides
});

describe("selectGithubLoginEmail", () => {
  test("prefers the primary verified email", () => {
    const result = selectGithubLoginEmail([
      email({ email: "verified@example.com", verified: true }),
      email({ email: "primary@example.com", primary: true, verified: true })
    ]);

    expect(result).toEqual({ email: "primary@example.com", isEmailVerifiedByProvider: true });
  });

  test("falls back to any verified email when the primary email is unverified", () => {
    const result = selectGithubLoginEmail([
      email({ email: "primary@example.com", primary: true, verified: false }),
      email({ email: "verified@example.com", verified: true })
    ]);

    expect(result).toEqual({ email: "verified@example.com", isEmailVerifiedByProvider: true });
  });

  test("falls back to the primary email and reports it unverified when no email is verified", () => {
    const result = selectGithubLoginEmail([
      email({ email: "primary@example.com", primary: true, verified: false }),
      email({ email: "other@example.com", verified: false })
    ]);

    expect(result).toEqual({ email: "primary@example.com", isEmailVerifiedByProvider: false });
  });

  test("returns null when the account exposes no emails", () => {
    expect(selectGithubLoginEmail([])).toBeNull();
  });
});
