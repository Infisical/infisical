import {
  ProxiedServiceCredentialRole,
  ProxiedServiceHeaderPurpose,
  ProxiedServiceSubstitutionSurface
} from "./proxied-service-enums";
import { CredentialsArraySchema, hostPatternSchema } from "./proxied-service-schemas";

// The host-pattern grammar mirrors the agent-proxy CLI matcher (packages/agentproxy/match.go);
// keep these cases in sync with that matcher's expectations.
const parse = (value: string) => hostPatternSchema.safeParse(value);
const firstError = (value: string) => {
  const result = parse(value);
  return result.success ? undefined : result.error.issues[0]?.message;
};

describe("hostPatternSchema", () => {
  describe("string-level constraints", () => {
    it("rejects an empty string", () => {
      expect(parse("").success).toBe(false);
      expect(firstError("")).toBe("Host pattern is required");
    });

    it("rejects a whitespace-only string", () => {
      expect(parse("   ").success).toBe(false);
    });

    it("accepts a long pattern within the 255-char limit", () => {
      expect(parse(`${"a".repeat(240)}.example.com`).success).toBe(true);
    });

    it("rejects a pattern longer than 255 chars", () => {
      expect(parse(`${"a".repeat(300)}.com`).success).toBe(false);
    });
  });

  describe("valid patterns", () => {
    it.each([
      "api.stripe.com", // exact host
      "localhost", // single label
      "*.github.com", // wildcard (one subdomain level)
      "127.0.0.1", // IPv4
      "10.0.0.1", // private IPv4
      "my-api.example.com", // internal hyphen
      "api2.example.com", // digits in label
      "API.Stripe.COM", // case-insensitive
      "api.stripe.com:443", // with port
      "api.stripe.com:1", // min port
      "127.0.0.1:65535", // max port
      "api.stripe.com/v1/*", // with path
      "internal.corp.com:3000/api/*", // port + path
      "api.stripe.com/weird!!/path", // path content is free-form
      "api.stripe.com, dashboard.stripe.com", // multiple, comma-separated
      "*.stripe.com, *.github.com", // multiple wildcards
      "*.stripe.com:443/v1/*", // wildcard + port + path
      "  api.stripe.com ,  b.example.com ", // segment whitespace trimmed
      "[::1]", // bracketed IPv6
      "[2001:db8::1]:8443", // bracketed IPv6 + port
      "[fe80::1]/v1/*", // bracketed IPv6 + path
      "api.stripe.com:07" // leading-zero port is accepted
    ])("accepts %s", (value) => {
      expect(parse(value).success).toBe(true);
    });
  });

  describe("invalid patterns", () => {
    it.each([
      "-api.com", // leading hyphen
      "api-.com", // trailing hyphen
      "api_v1.com", // underscore
      "api..com", // empty label
      "api.com.", // trailing dot
      "*", // bare wildcard
      "*api.com", // wildcard not followed by dot
      "a*.com", // mid-label wildcard
      "*.*.com", // wildcard label
      ":443", // empty host
      "/v1/*", // path only, empty host
      "api b.com", // internal space
      "api.stripe.com:0", // port below range
      "api.stripe.com:65536", // port above range
      "api.stripe.com:abc", // non-numeric port
      "api.stripe.com:-1", // negative port
      "api.stripe.com:", // empty port
      "::1", // bare (unbracketed) IPv6
      "[::1", // unclosed bracket
      "[not-an-ip]", // brackets without a valid IPv6
      "[::1]:70000", // bracketed IPv6 with out-of-range port
      "[::1]foo", // garbage after the closing bracket (not a :port)
      "[::1]:abc", // non-numeric port after bracket
      "api.stripe.com:443:8080", // double colon / port
      "[127.0.0.1]", // IPv4 inside brackets (brackets are IPv6-only)
      ",api.stripe.com" // leading comma produces an empty entry
    ])("rejects %s", (value) => {
      expect(parse(value).success).toBe(false);
    });
  });

  describe("reports the specific failing rule", () => {
    it("empty entry (trailing comma)", () => {
      expect(firstError("api.stripe.com,")).toBe("Host pattern has an empty entry");
    });

    it("empty entry (double comma)", () => {
      expect(firstError("api.stripe.com,,b.com")).toBe("Host pattern has an empty entry");
    });

    it("scheme included", () => {
      expect(firstError("https://api.stripe.com")).toContain("must not include a scheme");
    });

    it("invalid port", () => {
      expect(firstError("api.stripe.com:abc")).toContain("has an invalid port");
    });

    it("invalid hostname", () => {
      expect(firstError("api.stripe.com, bad_host")).toContain("is not a valid host pattern");
    });

    it("unclosed IPv6 bracket", () => {
      expect(firstError("[::1")).toContain("unclosed IPv6 bracket");
    });

    it("invalid IPv6 address", () => {
      expect(firstError("[not-an-ip]")).toContain("is not a valid IPv6 address");
    });
  });
});

describe("CredentialsArraySchema credential source (static vs dynamic)", () => {
  // environment is required on every credential: a service is project-scoped, so each credential names
  // the location its secret resolves at.
  const bearerHeader = {
    environment: "dev",
    role: ProxiedServiceCredentialRole.HeaderRewrite,
    headerName: "Authorization",
    headerPrefix: "Bearer"
  };
  const parseArray = (creds: unknown[]) => CredentialsArraySchema.safeParse(creds);
  const errorsOf = (creds: unknown[]) => {
    const result = parseArray(creds);
    return result.success ? [] : result.error.issues.map((i) => i.message);
  };

  it("accepts a static secretKey credential", () => {
    expect(parseArray([{ ...bearerHeader, secretKey: "STRIPE_API_KEY" }]).success).toBe(true);
  });

  it("rejects a credential with no environment", () => {
    const { environment, ...withoutEnvironment } = bearerHeader;
    expect(parseArray([{ ...withoutEnvironment, secretKey: "STRIPE_API_KEY" }]).success).toBe(false);
  });

  it("defaults secretPath to the project root", () => {
    const result = parseArray([{ ...bearerHeader, secretKey: "STRIPE_API_KEY" }]);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data[0].secretPath).toBe("/");
    }
  });

  it("keeps an explicit secretPath", () => {
    const result = parseArray([{ ...bearerHeader, secretKey: "STRIPE_API_KEY", secretPath: "/payments" }]);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data[0].secretPath).toBe("/payments");
    }
  });

  it("accepts credentials resolving in different environments", () => {
    expect(
      parseArray([
        { ...bearerHeader, environment: "dev", secretKey: "STRIPE_API_KEY" },
        { ...bearerHeader, environment: "prod", headerName: "x-tenant", secretKey: "TENANT_ID" }
      ]).success
    ).toBe(true);
  });

  // One outbound request carries one value per header, so the environment a credential resolves in does
  // not make a second writer of the same header unambiguous.
  it("still rejects two credentials setting the same header, even in different environments", () => {
    expect(
      errorsOf([
        { ...bearerHeader, environment: "dev", secretKey: "STRIPE_API_KEY" },
        { ...bearerHeader, environment: "prod", secretKey: "STRIPE_API_KEY_PROD" }
      ]).join(" ")
    ).toContain("is set by more than one credential");
  });

  it("accepts a dynamic credential with a field", () => {
    expect(
      parseArray([{ ...bearerHeader, dynamicSecretName: "my-postgres", dynamicSecretField: "DB_PASSWORD" }]).success
    ).toBe(true);
  });

  it("rejects a credential with neither secretKey nor dynamicSecretName", () => {
    expect(errorsOf([bearerHeader])).toContain("Provide exactly one of secretKey or dynamicSecretName");
  });

  it("rejects a credential with both secretKey and dynamicSecretName", () => {
    expect(
      errorsOf([
        { ...bearerHeader, secretKey: "K", dynamicSecretName: "my-postgres", dynamicSecretField: "DB_PASSWORD" }
      ])
    ).toContain("Provide exactly one of secretKey or dynamicSecretName");
  });

  it("rejects a dynamic credential missing dynamicSecretField", () => {
    expect(errorsOf([{ ...bearerHeader, dynamicSecretName: "my-postgres" }])).toContain(
      "dynamicSecretField is required when dynamicSecretName is set"
    );
  });

  it("rejects a static credential that also sets a dynamic field", () => {
    expect(errorsOf([{ ...bearerHeader, secretKey: "K", dynamicSecretField: "DB_PASSWORD" }])).toContain(
      "dynamicSecretField is only valid with dynamicSecretName"
    );
  });

  it("allows the same dynamic secret referenced twice with different fields (basic auth)", () => {
    expect(
      parseArray([
        {
          environment: "dev",
          role: ProxiedServiceCredentialRole.HeaderRewrite,
          headerPurpose: ProxiedServiceHeaderPurpose.Username,
          dynamicSecretName: "my-postgres",
          dynamicSecretField: "DB_USERNAME"
        },
        {
          environment: "dev",
          role: ProxiedServiceCredentialRole.HeaderRewrite,
          headerPurpose: ProxiedServiceHeaderPurpose.Password,
          dynamicSecretName: "my-postgres",
          dynamicSecretField: "DB_PASSWORD"
        }
      ]).success
    ).toBe(true);
  });

  it("accepts a dynamic substitution credential", () => {
    expect(
      parseArray([
        {
          environment: "dev",
          role: ProxiedServiceCredentialRole.CredentialSubstitution,
          placeholderKey: "TOKEN",
          placeholderValue: "placeholder_token",
          substitutionSurfaces: [ProxiedServiceSubstitutionSurface.Path],
          dynamicSecretName: "gh-app",
          dynamicSecretField: "TOKEN"
        }
      ]).success
    ).toBe(true);
  });
});

describe("CredentialsArraySchema basic auth", () => {
  const username = {
    environment: "dev",
    secretKey: "API_KEY",
    role: ProxiedServiceCredentialRole.HeaderRewrite,
    headerPurpose: ProxiedServiceHeaderPurpose.Username
  };
  const password = {
    environment: "dev",
    secretKey: "API_SECRET",
    role: ProxiedServiceCredentialRole.HeaderRewrite,
    headerPurpose: ProxiedServiceHeaderPurpose.Password
  };

  it("accepts a username without a password (username-only basic auth)", () => {
    expect(CredentialsArraySchema.safeParse([username]).success).toBe(true);
  });

  it("accepts a username with a password", () => {
    expect(CredentialsArraySchema.safeParse([username, password]).success).toBe(true);
  });

  it("rejects a password without a username", () => {
    const result = CredentialsArraySchema.safeParse([password]);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.message.includes("requires a username"))).toBe(true);
    }
  });

  it("rejects two username credentials", () => {
    const result = CredentialsArraySchema.safeParse([username, { ...username, secretKey: "OTHER" }]);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.message.includes("at most one"))).toBe(true);
    }
  });
});
