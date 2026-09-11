import { formatCommaSeparatedPolicyValues, splitCommaSeparatedPolicyValues } from "./identity-auth-policy-values";

describe("splitCommaSeparatedPolicyValues", () => {
  test.each([
    ["value1, value2", ["value1", "value2"]],
    ["{s,Scrapybaracapy/.github/}", ["{s,Scrapybaracapy/.github/}"]],
    ["a, {b,c}, d", ["a", "{b,c}", "d"]],
    ["{a,{b,c}}", ["{a,{b,c}}"]],
    ["viewer, {admin, deployer", ["viewer", "{admin", "deployer"]],
    ["foo\\{bar, admin", ["foo\\{bar", "admin"]],
    ["foo{bar, admin", ["foo{bar", "admin"]],
    ["foo\\\\{bar,baz}, admin", ["foo\\\\{bar,baz}", "admin"]],
    ["single", ["single"]],
    ["  ,  ", []]
  ])("splits %j", (input, expected) => {
    expect(splitCommaSeparatedPolicyValues(input)).toEqual(expected);
  });
});

describe("formatCommaSeparatedPolicyValues", () => {
  test.each([
    ["{s,Scrapybaracapy/.github/}", "{s,Scrapybaracapy/.github/}"],
    ["{a,b}, {c,d}", "{a,b}, {c,d}"],
    ["viewer, {admin, deployer", "viewer, {admin, deployer"],
    ["", ""]
  ])("formats %j", (input, expected) => {
    expect(formatCommaSeparatedPolicyValues(input)).toBe(expected);
  });
});
