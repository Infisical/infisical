import { describe, expect, it } from "vitest";

import {
  decodeTsv,
  encodeTsv,
  type GridColumn,
  type GridValue,
  parseGridValue,
  pasteGrid
} from "./data-grid-model";

describe("grid value integrity", () => {
  it("round-trips quotes, tabs, newlines, empty rows, NULL and the null marker", () => {
    const rows: GridValue[][] = [["NULL", null, "", "\\N"], ["a\tb", 'a"b', "a\r\nb", ""], [""]];
    expect(decodeTsv(encodeTsv(rows))).toEqual({ rows });
    expect(decodeTsv('"unterminated')).toHaveProperty("error");
    expect(decodeTsv("a\n")).toEqual({ rows: [["a"], [""]] });
  });
  it("preserves decimal and integer precision and treats NULL as literal text", () => {
    const column: GridColumn<string> = {
      id: "v",
      header: "Value",
      getValue: (row) => row,
      type: "int8"
    };
    expect(parseGridValue(column, "9007199254740993", "")).toEqual({
      value: "9007199254740993"
    });
    expect(parseGridValue({ ...column, type: "numeric" }, "0.123456789012345678901", "")).toEqual({
      value: "0.123456789012345678901"
    });
    expect(parseGridValue({ ...column, type: "text", nullable: true }, "NULL", "")).toEqual({
      value: "NULL"
    });
  });
  it.each([
    ["int2", "-32768", "32767", "-32769", "32768"],
    ["smallint", "-32768", "32767", "-32769", "32768"],
    ["int4", "-2147483648", "2147483647", "-2147483649", "2147483648"],
    ["integer", "-2147483648", "2147483647", "-2147483649", "2147483648"],
    [
      "int8",
      "-9223372036854775808",
      "9223372036854775807",
      "-9223372036854775809",
      "9223372036854775808"
    ],
    [
      "bigint",
      "-9223372036854775808",
      "9223372036854775807",
      "-9223372036854775809",
      "9223372036854775808"
    ]
  ])("enforces both signed boundaries for %s without rounding", (type, min, max, below, above) => {
    const column: GridColumn<string> = { id: "v", header: "Value", type, getValue: (row) => row };
    expect(parseGridValue(column, min, "")).toEqual({ value: min });
    expect(parseGridValue(column, max, "")).toEqual({ value: max });
    expect(parseGridValue(column, below, "")).toHaveProperty("error");
    expect(parseGridValue(column, above, "")).toHaveProperty("error");
    expect(parseGridValue(column, "-0001", "")).toEqual({ value: "-0001" });
  });
  it("leaves custom codecs authoritative and decimal precision rules to the host", () => {
    const parse = (value: GridValue) => ({ value });
    const column: GridColumn<string> = {
      id: "v",
      header: "Value",
      type: "int2",
      getValue: (row) => row,
      parse
    };
    expect(parseGridValue(column, "32768", "")).toEqual({ value: "32768" });
    expect(
      parseGridValue(
        { ...column, parse: undefined, type: "decimal" },
        "1.234567890123456789e500",
        ""
      )
    ).toEqual({ value: "1.234567890123456789e500" });
    expect(
      parseGridValue({ ...column, parse: undefined, type: "decimal" }, "1.2.3", "")
    ).toHaveProperty("error");
  });
  it("rejects invalid, protected and overflowing batches without partial changes", () => {
    const columns: GridColumn<string>[] = [
      { id: "v", header: "Value", getValue: (row) => row, type: "int4" }
    ];
    const base = {
      rows: ["1", "2"],
      columns,
      getRowId: (row: string) => row,
      active: { rowId: "1", columnId: "v" }
    };
    expect(pasteGrid({ ...base, text: "3\ninvalid" })).toHaveProperty("error");
    expect(pasteGrid({ ...base, text: "3\n2147483648" })).toHaveProperty("error");
    expect(pasteGrid({ ...base, text: "3\n4\n5" })).toHaveProperty("error");
    expect(
      pasteGrid({ ...base, columns: [{ ...columns[0]!, sensitive: true }], text: "3" })
    ).toHaveProperty("error");
    expect(pasteGrid({ ...base, text: "3\n4" })).toHaveProperty("changes", [
      expect.objectContaining({ rowId: "1", value: "3" }),
      expect.objectContaining({ rowId: "2", value: "4" })
    ]);
  });
});
