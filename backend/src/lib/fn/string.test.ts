import { sanitizeSqlLikeString } from "./string";

describe("sanitizeSqlLikeString", () => {
  test.each([
    ["plain", "plain"],
    ["https://service.ariba", "https://service.ariba"],
    ["100%", "100\\%"],
    ["%prod%", "\\%prod\\%"],
    ["foo_bar", "foo\\_bar"],
    ["a\\b", "a\\\\b"],
    ["mix_%\\", "mix\\_\\%\\\\"]
  ])("escapes LIKE wildcards in %p", (input, expected) => {
    expect(sanitizeSqlLikeString(input)).toBe(expected);
  });
});
