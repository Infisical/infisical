import { isAliasedEmail, normalizeEmail } from "./validate-email";

describe("normalizeEmail", () => {
  test("strips sub-addressing on every provider", () => {
    expect(normalizeEmail("dave+cu24vk@infisical.example")).toBe("dave@infisical.example");
    expect(normalizeEmail("first.last+billing@company.co.uk")).toBe("first.last@company.co.uk");
  });

  test("keeps dots outside Google, where they are significant", () => {
    expect(normalizeEmail("first.last@company.com")).toBe("first.last@company.com");
    expect(normalizeEmail("first.last@company.com")).not.toBe(normalizeEmail("firstlast@company.com"));
  });

  test("strips dots and folds googlemail onto gmail", () => {
    expect(normalizeEmail("first.last@gmail.com")).toBe("firstlast@gmail.com");
    expect(normalizeEmail("first.last@googlemail.com")).toBe("firstlast@gmail.com");
  });

  test("lowercases and trims", () => {
    expect(normalizeEmail("  First.Last+Tag@GMail.com ")).toBe("firstlast@gmail.com");
  });

  // Variant shapes reproduced from the Aug 2026 signup-OTP bombing campaign: scattered dots, a random
  // hex sub-address, and gmail/googlemail alternated within one target. Addresses are invented; the
  // real recipients were third parties with no Infisical account and do not belong in the repo.
  // Each target's variants must collapse onto one bucket, or the per-mailbox cooldown and the send cap
  // are bypassed by changing a single character.
  test.each([
    [
      "taylorquinn512@gmail.com",
      [
        "t.a.y.l.or.qu.i.n.n.5.1.2+8bc4e8@googlemail.com",
        "t.aylor.quinn.512+2996fb@gmail.com",
        "t.a.y.l.o.r.q.u.i.nn.5.1.2+af53f9@gmail.com",
        "ta.y.lor.q.u.i.n.n.512+1897e0@googlemail.com",
        "taylor.qui.nn512+4fb26f@gmail.com",
        "tay.l.orquin.n5.12+12b9ac@gmail.com",
        "t.a.y.l.o.r.q.u.i.n.n.5.12+0f7501@googlemail.com",
        "t.aylo.rqui.nn512+cae036@googlemail.com",
        "taylorq.u.i.n.n.512+685bc4@gmail.com"
      ]
    ],
    ["moragray1990@gmail.com", ["m.o.ra.gr.ay.19.90+889e3f@gmail.com", "m.ora.g.r.a.y.1.9.9.0+170026@gmail.com"]],
    [
      "dave@infisical.example",
      [
        "dave+cu24vk@infisical.example",
        "dave+sf7yq@infisical.example",
        "dave+kwyr@infisical.example",
        "dave+qe0u@infisical.example",
        "dave+dt5pd@infisical.example"
      ]
    ]
  ])("collapses every observed variant onto %s", (mailbox, variants) => {
    expect(new Set(variants.map(normalizeEmail))).toEqual(new Set([mailbox]));
  });

  test("leaves a local part of only separators alone rather than collapsing it to nothing", () => {
    expect(normalizeEmail("+tag@company.com")).toBe("+tag@company.com");
    expect(normalizeEmail("...@gmail.com")).toBe("...@gmail.com");
  });

  test("returns malformed input untouched instead of throwing", () => {
    expect(normalizeEmail("not-an-email")).toBe("not-an-email");
    expect(normalizeEmail("@company.com")).toBe("@company.com");
    expect(normalizeEmail("user@")).toBe("user@");
  });
});

describe("isAliasedEmail", () => {
  test("flags variants but not the canonical address", () => {
    expect(isAliasedEmail("dave+kwyr@infisical.example")).toBe(true);
    expect(isAliasedEmail("first.last@gmail.com")).toBe(true);
    expect(isAliasedEmail("dave@infisical.example")).toBe(false);
    expect(isAliasedEmail("first.last@company.com")).toBe(false);
  });
});
