import { describe, expect, it } from "vitest";

import {
  extractK8sUsername,
  getJwtFingerprintForLog,
  getKubernetesHostname,
  getKubernetesServerName,
  getKubernetesStatusForLog,
  withKubernetesHostScheme
} from "./identity-kubernetes-auth-fns";

describe("getJwtFingerprintForLog", () => {
  const jwt = "eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJzeXN0ZW06c2VydmljZWFjY291bnQifQ.c2lnbmF0dXJlLWJ5dGVz";

  it("returns a stable 12-char hex digest that shares no substring with the token", () => {
    const fingerprint = getJwtFingerprintForLog(jwt) as string;

    expect(fingerprint).toMatch(/^[0-9a-f]{12}$/);
    expect(getJwtFingerprintForLog(jwt)).toBe(fingerprint);
    expect(getJwtFingerprintForLog(`${jwt}x`)).not.toBe(fingerprint);
    expect(jwt).not.toContain(fingerprint);
  });

  it("returns undefined for a missing token", () => {
    expect(getJwtFingerprintForLog("")).toBeUndefined();
    expect(getJwtFingerprintForLog(undefined)).toBeUndefined();
  });
});

describe("getKubernetesStatusForLog", () => {
  it("keeps only reason and message from a Status body, bounded", () => {
    expect(
      getKubernetesStatusForLog({ kind: "Status", reason: "Forbidden", message: "m".repeat(5000), details: { x: 1 } })
    ).toEqual({ reason: "Forbidden", message: `${"m".repeat(1024)}...[truncated]` });
  });

  it("treats a string body as the message and ignores anything else", () => {
    expect(getKubernetesStatusForLog("upstream error")).toEqual({ message: "upstream error" });
    expect(getKubernetesStatusForLog(undefined)).toEqual({});
    expect(getKubernetesStatusForLog(401)).toEqual({});
  });

  describe("when the cluster echoes credentials back", () => {
    const reviewerJwt = "eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJyZXZpZXdlciJ9.cmV2aWV3ZXItc2lnbmF0dXJl";
    const workloadJwt = "eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJ3b3JrbG9hZCJ9.d29ya2xvYWQtc2lnbmF0dXJl";
    const opaqueReviewerToken = "opaque-reviewer-token-0123456789abcdef";

    it("removes both JWTs from message and reason", () => {
      const result = getKubernetesStatusForLog(
        { reason: `bad token ${workloadJwt}`, message: `Authorization: Bearer ${reviewerJwt} rejected` },
        [reviewerJwt, workloadJwt]
      );
      expect(JSON.stringify(result)).not.toContain(reviewerJwt);
      expect(JSON.stringify(result)).not.toContain(workloadJwt);
      expect(result).toEqual({
        reason: "bad token [REDACTED]",
        message: "Authorization: Bearer [REDACTED] rejected"
      });
    });

    it("removes an opaque reviewer token that does not look like a JWT", () => {
      expect(
        getKubernetesStatusForLog({ message: `token ${opaqueReviewerToken} is invalid` }, [opaqueReviewerToken])
      ).toEqual({ message: "token [REDACTED] is invalid" });
    });

    it("removes partial or unknown JWTs from a plain-text body", () => {
      const partial = reviewerJwt.slice(0, 30);
      const result = getKubernetesStatusForLog(
        `rejected ${partial} (cut) and eyJhbGciOiJIUzI1NiJ9.eyJmb28iOiJiYXIifQ.x`
      );
      expect(result.message).toBe("rejected [REDACTED] (cut) and [REDACTED]");
    });

    it("scrubs before truncating so a token cut at the limit cannot survive", () => {
      const message = `${"m".repeat(1000)}${reviewerJwt}`;
      const result = getKubernetesStatusForLog({ message }, [reviewerJwt]);
      expect(result.message).toBe(`${"m".repeat(1000)}[REDACTED]`);
      expect(result.message).not.toContain(reviewerJwt.slice(0, 24));
    });

    it("ignores missing secrets", () => {
      expect(getKubernetesStatusForLog({ message: "plain failure" }, [undefined, ""])).toEqual({
        message: "plain failure"
      });
    });
  });
});

describe("withKubernetesHostScheme", () => {
  it("leaves an explicit scheme alone and defaults the rest to https", () => {
    expect(withKubernetesHostScheme("https://k8s.example.com:6443")).toBe("https://k8s.example.com:6443");
    expect(withKubernetesHostScheme("http://k8s.example.com")).toBe("http://k8s.example.com");
    expect(withKubernetesHostScheme("k8s.example.com:6443")).toBe("https://k8s.example.com:6443");
  });
});

describe("getKubernetesServerName", () => {
  it.each([
    ["https://k8s.example.com:6443", "k8s.example.com"],
    ["https://k8s.example.com", "k8s.example.com"],
    ["http://k8s.example.com:8080", "k8s.example.com"],
    ["k8s.example.com:6443", "k8s.example.com"],
    ["k8s.example.com", "k8s.example.com"],
    ["https://cluster.mk8s.us-north1.nebius.cloud:443", "cluster.mk8s.us-north1.nebius.cloud"]
  ])("keeps the host name for %s", (host, expected) => {
    expect(getKubernetesServerName(host)).toBe(expected);
  });

  // SNI carries host names only (RFC 6066); sending an IP literal makes strict servers
  // reject the handshake, and the cert is matched on its IP SANs instead.
  it.each([["https://10.0.0.1:6443"], ["https://10.0.0.1"], ["10.0.0.1:6443"], ["10.0.0.1"]])(
    "returns undefined for the IPv4 host %s",
    (host) => {
      expect(getKubernetesServerName(host)).toBeUndefined();
    }
  );

  // The previous lastIndexOf(":") split truncated "[::1]:6443" to "[::1]" and a bare
  // "::1" to ":", neither of which isIP recognises, so both were sent as SNI.
  it.each([["https://[2001:db8::1]:6443"], ["https://[2001:db8::1]"], ["[2001:db8::1]:6443"], ["https://[::1]:6443"]])(
    "returns undefined for the IPv6 host %s rather than a truncated name",
    (host) => {
      expect(getKubernetesServerName(host)).toBeUndefined();
    }
  );

  it("returns undefined rather than throwing for an unparseable host", () => {
    expect(getKubernetesServerName("")).toBeUndefined();
    expect(getKubernetesServerName("https://")).toBeUndefined();
    expect(getKubernetesServerName("http://[not-an-ipv6")).toBeUndefined();
  });

  it("ignores a path or query on the configured host", () => {
    expect(getKubernetesServerName("https://k8s.example.com:6443/apis")).toBe("k8s.example.com");
    expect(getKubernetesServerName("https://k8s.example.com?x=1")).toBe("k8s.example.com");
  });
});

describe("getKubernetesHostname", () => {
  // The tunnelled gateway request is addressed to localhost, so the certificate identity
  // check has nothing but this to go on — an IP host has to survive it.
  it.each([
    ["https://10.0.0.1:6443", "10.0.0.1"],
    ["10.0.0.1", "10.0.0.1"],
    ["https://[2001:db8::1]:6443", "2001:db8::1"],
    ["https://k8s.example.com:6443", "k8s.example.com"],
    ["k8s.example.com", "k8s.example.com"]
  ])("returns the bare host for %s", (host, expected) => {
    expect(getKubernetesHostname(host)).toBe(expected);
  });

  it("returns undefined for an unparseable host", () => {
    expect(getKubernetesHostname("")).toBeUndefined();
    expect(getKubernetesHostname("https://")).toBeUndefined();
  });
});

describe("extractK8sUsername", () => {
  it("splits a service account username into namespace and name", () => {
    expect(extractK8sUsername("system:serviceaccount:default:infisical-auth")).toEqual({
      namespace: "default",
      name: "infisical-auth"
    });
  });

  it("rejects a username that is not a service account", () => {
    expect(() => extractK8sUsername("kubernetes-admin")).toThrow(/Invalid Kubernetes service account username/);
  });
});
