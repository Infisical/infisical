import { describe, expect, it } from "vitest";

import { parseCsvToMatrix } from "./parseSecrets";

describe("parseCsvToMatrix", () => {
  it.each([
    {
      input: '"Secret;Name;Key",value\nAPI_KEY,abc\n',
      delimiter: ",",
      header: "Secret;Name;Key"
    },
    {
      input: '"Secret,Name,Key";value\nAPI_KEY;abc\n',
      delimiter: ";",
      header: "Secret,Name,Key"
    },
    {
      input: '"Secret,Name,Key"\tvalue\nAPI_KEY\tabc\n',
      delimiter: "\t",
      header: "Secret,Name,Key"
    },
    {
      input: '"Secret,Name,Key"|value\nAPI_KEY|abc\n',
      delimiter: "|",
      header: "Secret,Name,Key"
    }
  ])("ignores quoted delimiters when detecting $delimiter", ({ input, delimiter, header }) => {
    expect(parseCsvToMatrix(input)).toEqual({
      delimiter,
      matrix: [
        [header, "value"],
        ["API_KEY", "abc"]
      ]
    });
  });

  it("keeps escaped quotes inside a quoted header", () => {
    expect(parseCsvToMatrix('"Secret ""Name,Key,Id""";value\nAPI_KEY;abc\n')).toEqual({
      delimiter: ";",
      matrix: [
        ['Secret "Name,Key,Id"', "value"],
        ["API_KEY", "abc"]
      ]
    });
  });

  it("detects the delimiter after a multiline quoted header", () => {
    expect(parseCsvToMatrix('"Secret,Name\nKey";value\nAPI_KEY;abc\n')).toEqual({
      delimiter: ";",
      matrix: [
        ["Secret,Name\nKey", "value"],
        ["API_KEY", "abc"]
      ]
    });
  });

  it("defaults to comma when the header contains no unquoted delimiter", () => {
    expect(parseCsvToMatrix('"Secret;Name;Key"\nAPI_KEY\n')).toEqual({
      delimiter: ",",
      matrix: [["Secret;Name;Key"], ["API_KEY"]]
    });
  });
});
