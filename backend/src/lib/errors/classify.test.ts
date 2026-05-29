import { createMongoAbility, ForbiddenError } from "@casl/ability";
import { AxiosError } from "axios";

import { classifyError } from "./classify";
import { BadRequestError, ForbiddenRequestError, NotFoundError, RateLimitError, UnauthorizedError } from "./index";

describe("classifyError", () => {
  test("maps known Infisical error classes to bounded labels", () => {
    expect(classifyError(new UnauthorizedError({ message: "x" }))).toBe("auth");
    expect(classifyError(new ForbiddenRequestError({ message: "x" }))).toBe("permission");
    expect(classifyError(new RateLimitError({ message: "x" }))).toBe("rate_limit");
    expect(classifyError(new NotFoundError({ message: "x" }))).toBe("not_found");
    expect(classifyError(new BadRequestError({ message: "x" }))).toBe("validation");
  });

  test("maps CASL ForbiddenError (thrown by permission checks) to permission, not unknown", () => {
    expect(classifyError(ForbiddenError.from(createMongoAbility([])))).toBe("permission");
  });

  test("classifies connection-level codes on raw Node errors (not just axios)", () => {
    expect(classifyError(Object.assign(new Error("boom"), { code: "ETIMEDOUT" }))).toBe("timeout");
    expect(classifyError(Object.assign(new Error("boom"), { code: "ECONNRESET" }))).toBe("network");
    expect(classifyError(Object.assign(new Error("boom"), { code: "ECONNREFUSED" }))).toBe("network");
  });

  test("does NOT treat a bare non-network code (e.g. fs ENOENT) as network", () => {
    expect(classifyError(Object.assign(new Error("no such file"), { code: "ENOENT" }))).toBe("unknown");
  });

  test("maps axios HTTP status codes to bounded labels", () => {
    const make = (status: number) => new AxiosError("http", undefined, undefined, undefined, { status } as never);
    expect(classifyError(make(429))).toBe("rate_limit");
    expect(classifyError(make(401))).toBe("auth");
    expect(classifyError(make(403))).toBe("auth");
    expect(classifyError(make(404))).toBe("not_found");
    expect(classifyError(make(400))).toBe("validation");
    expect(classifyError(make(502))).toBe("network");
  });

  test("falls back to message heuristics then unknown", () => {
    expect(classifyError(new Error("Connection timed out"))).toBe("timeout");
    expect(classifyError(new Error("network unreachable"))).toBe("network");
    expect(classifyError(new Error("something else entirely"))).toBe("unknown");
    expect(classifyError("a plain string")).toBe("unknown");
    expect(classifyError(undefined)).toBe("unknown");
  });
});
