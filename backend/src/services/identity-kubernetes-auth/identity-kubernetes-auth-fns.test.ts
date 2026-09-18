import { describe, expect, it } from "vitest";

import {
  extractK8sUsername,
  getKubernetesHostname,
  getKubernetesServerName,
  withKubernetesHostScheme
} from "./identity-kubernetes-auth-fns";

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
