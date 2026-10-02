import { EventEmitter } from "node:events";

import {
  buildDomainBaseDN,
  escapeLdapFilterValue,
  getLdapAttribute,
  getLdapAttributeBuffer,
  netbiosFromDomainFqdn,
  searchLdap
} from "./ldap-search-fns";

const NUL = String.fromCharCode(0);

type TCapturedSearch = { baseDN: string; options: Record<string, unknown> };

const buildClient = (script: (res: EventEmitter) => void, captured: TCapturedSearch[]) =>
  ({
    search: (baseDN: string, options: Record<string, unknown>, cb: (err: Error | null, res: EventEmitter) => void) => {
      captured.push({ baseDN, options });
      const res = new EventEmitter();
      cb(null, res);
      setImmediate(() => script(res));
    }
  }) as never;

const entry = (attributes: { type: string; values: string[]; buffers: Buffer[] }[]) => ({ attributes }) as never;

describe("getLdapAttribute", () => {
  test("matches the attribute name case insensitively", () => {
    const e = entry([{ type: "dNSHostName", values: ["web01.corp.example.com"], buffers: [] }]);
    expect(getLdapAttribute(e, "dnshostname")).toBe("web01.corp.example.com");
  });

  test("returns an empty string when the attribute is absent", () => {
    expect(getLdapAttribute(entry([]), "cn")).toBe("");
  });

  test("reads raw bytes for binary attributes", () => {
    const buf = Buffer.from([1, 2, 3]);
    const e = entry([{ type: "objectGUID", values: [], buffers: [buf] }]);
    expect(getLdapAttributeBuffer(e, "objectguid")).toBe(buf);
    expect(getLdapAttributeBuffer(entry([]), "objectGUID")).toBeUndefined();
  });
});

describe("buildDomainBaseDN", () => {
  test("maps every label to a DC component", () => {
    expect(buildDomainBaseDN("corp.example.com")).toBe("DC=corp,DC=example,DC=com");
  });

  test("handles a single label and ignores empty ones", () => {
    expect(buildDomainBaseDN("corp")).toBe("DC=corp");
    expect(buildDomainBaseDN("corp..com")).toBe("DC=corp,DC=com");
  });
});

describe("searchLdap", () => {
  test("defaults match the behaviour PAM discovery relied on before extraction", async () => {
    const captured: TCapturedSearch[] = [];
    const client = buildClient((res) => res.emit("end", { status: 0 }), captured);

    await searchLdap(client, {
      baseDN: "DC=corp,DC=example,DC=com",
      filter: "(objectClass=user)",
      attributes: ["cn"],
      pageSize: 500,
      timeLimitSeconds: 30
    });

    expect(captured[0].options).toEqual({
      filter: "(objectClass=user)",
      scope: "sub",
      attributes: ["cn"],
      timeLimit: 30,
      paged: { pageSize: 500 }
    });
    expect(captured[0].options).not.toHaveProperty("sizeLimit");
  });

  test("omits the paging control when no page size is given", async () => {
    const captured: TCapturedSearch[] = [];
    const client = buildClient((res) => res.emit("end", { status: 0 }), captured);

    await searchLdap(client, {
      baseDN: "DC=corp",
      filter: "(objectCategory=computer)",
      attributes: ["cn"],
      sizeLimit: 50,
      timeLimitSeconds: 15
    });

    expect(captured[0].options).not.toHaveProperty("paged");
    expect(captured[0].options.sizeLimit).toBe(50);
  });

  test("rejects sizeLimitExceeded unless the caller opted in", async () => {
    const captured: TCapturedSearch[] = [];
    const sizeLimitError = Object.assign(new Error("Size Limit Exceeded"), { code: 4 });

    const strict = buildClient((res) => res.emit("error", sizeLimitError), captured);
    await expect(
      searchLdap(strict, { baseDN: "DC=corp", filter: "(cn=*)", attributes: [], timeLimitSeconds: 30 })
    ).rejects.toThrow("Size Limit Exceeded");

    const lenient = buildClient((res) => {
      res.emit("searchEntry", entry([{ type: "cn", values: ["web01"], buffers: [] }]));
      res.emit("error", sizeLimitError);
    }, captured);
    const entries = await searchLdap(lenient, {
      baseDN: "DC=corp",
      filter: "(cn=*)",
      attributes: [],
      timeLimitSeconds: 15,
      acceptSizeLimitExceeded: true
    });
    expect(entries).toHaveLength(1);
  });

  test("a non-sizeLimit error still rejects even when the caller opted in", async () => {
    const captured: TCapturedSearch[] = [];
    const client = buildClient((res) => res.emit("error", Object.assign(new Error("Busy"), { code: 51 })), captured);
    await expect(
      searchLdap(client, {
        baseDN: "DC=corp",
        filter: "(cn=*)",
        attributes: [],
        timeLimitSeconds: 15,
        acceptSizeLimitExceeded: true
      })
    ).rejects.toThrow("Busy");
  });

  test("collects entries and lets a caller map failures into its own error type", async () => {
    const captured: TCapturedSearch[] = [];
    const client = buildClient((res) => {
      res.emit("searchEntry", entry([{ type: "cn", values: ["web01"], buffers: [] }]));
      res.emit("end", { status: 0 });
    }, captured);

    const entries = await searchLdap(client, {
      baseDN: "DC=corp",
      filter: "(cn=*)",
      attributes: ["cn"],
      timeLimitSeconds: 15
    });
    expect(entries).toHaveLength(1);
    expect(getLdapAttribute(entries[0], "cn")).toBe("web01");

    const failing = buildClient((res) => res.emit("end", { status: 32 }), captured);
    await expect(
      searchLdap(failing, {
        baseDN: "DC=corp",
        filter: "(cn=*)",
        attributes: [],
        timeLimitSeconds: 15,
        mapError: ({ status }) => new Error(`mapped:${status}`)
      })
    ).rejects.toThrow("mapped:32");
  });
});

describe("escapeLdapFilterValue", () => {
  test("escapes every character that is special in an LDAP filter", () => {
    expect(escapeLdapFilterValue("web*01")).toBe("web\\2a01");
    expect(escapeLdapFilterValue("a(b)c")).toBe("a\\28b\\29c");
    expect(escapeLdapFilterValue("back\\slash")).toBe("back\\5cslash");
    expect(escapeLdapFilterValue(`nul${NUL}end`)).toBe("nul\\00end");
  });

  test("neutralizes a filter injection attempt", () => {
    expect(escapeLdapFilterValue("*)(objectClass=*")).toBe("\\2a\\29\\28objectClass=\\2a");
  });

  test("escapes the backslash before the characters whose escapes introduce one", () => {
    expect(escapeLdapFilterValue("\\*")).toBe("\\5c\\2a");
  });

  test("leaves an ordinary host name untouched", () => {
    expect(escapeLdapFilterValue("server01.corp.example.com")).toBe("server01.corp.example.com");
  });
});

describe("netbiosFromDomainFqdn", () => {
  test("uppercases the first label", () => {
    expect(netbiosFromDomainFqdn("corp.example.com")).toBe("CORP");
    expect(netbiosFromDomainFqdn("corp")).toBe("CORP");
  });
});
