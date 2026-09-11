import { describe, expect, test } from "vitest";

import { BadRequestError } from "@app/lib/errors";

import { safeDecodeURIComponent } from "./schemas";

describe("safeDecodeURIComponent", () => {
  test("decodes percent-encoded characters correctly", () => {
    expect(safeDecodeURIComponent("hello%20world")).toBe("hello world");
    expect(safeDecodeURIComponent("dev%2Cstaging")).toBe("dev,staging");
  });

  test("leaves unencoded strings untouched", () => {
    expect(safeDecodeURIComponent("dev,staging")).toBe("dev,staging");
    expect(safeDecodeURIComponent("simple-string")).toBe("simple-string");
  });

  test("throws BadRequestError on malformed percent encoding", () => {
    expect(() => safeDecodeURIComponent("%2")).toThrow(BadRequestError);
    expect(() => safeDecodeURIComponent("%")).toThrow(BadRequestError);
    expect(() => safeDecodeURIComponent("valid%20then%2")).toThrow(BadRequestError);
    expect(() => safeDecodeURIComponent("%E0%A4%A")).toThrow(BadRequestError);
  });
});
