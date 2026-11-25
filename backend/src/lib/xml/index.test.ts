import { decodeXmlNamedEntities, escapeXml } from "./index";

describe("escapeXml", () => {
  test("escapes the five XML special characters and leaves carriage returns alone by default", () => {
    expect(escapeXml(`a&b<c>d"e'f\rg`)).toBe("a&amp;b&lt;c&gt;d&quot;e&apos;f\rg");
  });

  test("encodes carriage returns as a character reference when asked", () => {
    expect(escapeXml("line\r\nnext&", { encodeCarriageReturn: true })).toBe("line&#13;\nnext&amp;");
  });

  test("accepts numbers", () => {
    expect(escapeXml(42)).toBe("42");
  });
});

describe("decodeXmlNamedEntities", () => {
  test("decodes the five named entities once, without decoding the result again", () => {
    expect(decodeXmlNamedEntities("a&lt;b&gt;&amp;lt;&quot;&apos;")).toBe(`a<b>&lt;"'`);
  });
});
