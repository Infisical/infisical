import dns from "node:dns/promises";

import { followCnameChain } from "./index";

const endOfChain = () => Promise.reject(Object.assign(new Error("no data"), { code: "ENODATA" }));

describe("followCnameChain", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("follows CNAMEs to the last name in the chain", async () => {
    const cnames: Record<string, string> = {
      "app.example.com": "edge.example.net",
      "edge.example.net": "origin.example.net"
    };
    vi.spyOn(dns, "resolveCname").mockImplementation(async (hostname: string) =>
      cnames[hostname] ? [cnames[hostname]] : endOfChain()
    );

    await expect(followCnameChain("app.example.com", () => undefined)).resolves.toBe("origin.example.net");
  });

  test("stops at the name whose lookup failed when the caller does not throw", async () => {
    vi.spyOn(dns, "resolveCname").mockImplementation(async (hostname: string) =>
      hostname === "app.example.com"
        ? ["edge.example.net"]
        : Promise.reject(Object.assign(new Error("server failure"), { code: "ESERVFAIL" }))
    );
    const onResolveError = vi.fn();

    await expect(followCnameChain("app.example.com", onResolveError)).resolves.toBe("edge.example.net");
    expect(onResolveError).toHaveBeenCalledWith(expect.objectContaining({ code: "ESERVFAIL" }), "edge.example.net");
  });

  test("passes on what the caller throws", async () => {
    vi.spyOn(dns, "resolveCname").mockRejectedValue(Object.assign(new Error("server failure"), { code: "ESERVFAIL" }));

    await expect(
      followCnameChain("app.example.com", () => {
        throw new Error("refused");
      })
    ).rejects.toThrow("refused");
  });

  test("stops after ten hops on a CNAME loop", async () => {
    const resolveCname = vi
      .spyOn(dns, "resolveCname")
      .mockImplementation(async (hostname: string) => [
        hostname === "a.example.com" ? "b.example.com" : "a.example.com"
      ]);

    await expect(followCnameChain("a.example.com", () => undefined)).resolves.toBe("a.example.com");
    expect(resolveCname).toHaveBeenCalledTimes(10);
  });
});
