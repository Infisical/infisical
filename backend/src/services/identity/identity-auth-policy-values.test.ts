import { validateJwtBoundClaimsField } from "../identity-jwt-auth/identity-jwt-auth-validators";
import { formatOidcAudiences, validateOidcBoundClaimsField } from "../identity-oidc-auth/identity-oidc-auth-validators";
import { formatCommaSeparatedPolicyValues, splitCommaSeparatedPolicyValues } from "./identity-auth-policy-values";

describe("splitCommaSeparatedPolicyValues", () => {
  test.each([
    ["value1, value2", ["value1", "value2"]],
    ["value1,value2", ["value1", "value2"]],
    ["{s,Scrapybaracapy/.github/}", ["{s,Scrapybaracapy/.github/}"]],
    ["{s,Scrapybaracapy/.github/}, other", ["{s,Scrapybaracapy/.github/}", "other"]],
    ["a, {b,c}, d", ["a", "{b,c}", "d"]],
    ["{a,{b,c}}", ["{a,{b,c}}"]],
    ["single", ["single"]],
    ["", []],
    ["  ,  ", []]
  ])("splits %j", (input, expected) => {
    expect(splitCommaSeparatedPolicyValues(input)).toEqual(expected);
  });
});

describe("formatCommaSeparatedPolicyValues", () => {
  test("leaves glob braces unchanged", () => {
    expect(formatCommaSeparatedPolicyValues("{s,Scrapybaracapy/.github/}")).toBe("{s,Scrapybaracapy/.github/}");
  });

  test("normalizes a list without inserting spaces inside braces", () => {
    expect(formatCommaSeparatedPolicyValues("value1,value2")).toBe("value1, value2");
    expect(formatCommaSeparatedPolicyValues("{a,b}, {c,d}")).toBe("{a,b}, {c,d}");
  });

  test("returns an empty string unchanged", () => {
    expect(formatCommaSeparatedPolicyValues("")).toBe("");
  });
});

describe("OIDC/JWT claim validators", () => {
  test("do not insert a space into a pasted glob brace claim", () => {
    expect(validateOidcBoundClaimsField.parse({ sub: "{s,Scrapybaracapy/.github/}" })).toEqual({
      sub: "{s,Scrapybaracapy/.github/}"
    });
    expect(validateJwtBoundClaimsField.parse({ sub: "{s,Scrapybaracapy/.github/}" })).toEqual({
      sub: "{s,Scrapybaracapy/.github/}"
    });
  });

  test("still normalize a comma-separated list of claim values", () => {
    expect(validateOidcBoundClaimsField.parse({ role: "admin,member" })).toEqual({
      role: "admin, member"
    });
  });

  test("formatOidcAudiences leaves glob braces unchanged", () => {
    expect(formatOidcAudiences("{https://a.example,https://b.example}")).toBe("{https://a.example,https://b.example}");
  });
});
