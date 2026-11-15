import type { LookupAllOptions } from "node:dns";
import net from "node:net";
import tls from "node:tls";

import ldapjs from "@infisical/ldapjs";
import LdapAuth from "ldapauth-fork";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  connectTimeAnswer,
  createSelfSignedCert,
  installConnectTimeDns,
  INTERNAL_IP,
  PUBLIC_IP,
  REBIND_HOST,
  startTargetPair,
  TTargetPair
} from "@app/lib/validator/dns-rebinding.test-utils";
import { LdapProvider } from "@app/services/app-connection/ldap/ldap-connection-enums";
import { getLdapConnectionClient } from "@app/services/app-connection/ldap/ldap-connection-fns";

import { pinLdapTarget, testLDAPConfig } from "./ldap-fns";

// Every LDAP client here connects to a name whose DNS answer changes after validation (see
// dns-rebinding.test-utils). Each test opens real sockets and checks which address received them.
const { validationAnswer } = vi.hoisted(() => ({ validationAnswer: { addresses: ["127.0.0.1"] } }));

vi.mock("node:dns/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:dns/promises")>();
  const lookup = (hostname: string, options: LookupAllOptions) =>
    hostname === "rebind.invalid"
      ? Promise.resolve(validationAnswer.addresses.map((address) => ({ address, family: 4 })))
      : actual.lookup(hostname, options);
  return { ...actual, lookup, default: { ...actual, lookup } };
});

// 127.0.0.1 plays the public address and 127.0.0.3 a public address nothing listens on, so both have to pass
// the private-address check
vi.mock("@app/lib/ip/ipRange", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@app/lib/ip/ipRange")>();
  return {
    ...actual,
    isPrivateIp: (ip: string) => ip !== "127.0.0.1" && ip !== "127.0.0.3" && actual.isPrivateIp(ip)
  };
});

vi.mock("@app/lib/config/env", () => ({
  getConfig: () => ({ isDevelopmentMode: false, ALLOW_INTERNAL_IP_CONNECTIONS: false })
}));

vi.mock("@app/ee/services/dynamic-secret/dynamic-secret-fns", () => ({
  verifyHostInputValidity: vi.fn(async () => undefined)
}));

vi.mock("@app/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}));

const ignore = () => {};

describe("LDAP connections under DNS rebinding", () => {
  let restoreDns: () => void;
  let targets: TTargetPair;

  beforeAll(async () => {
    restoreDns = installConnectTimeDns();
    targets = await startTargetPair(() => net.createServer((socket) => socket.destroy()));
  });

  afterAll(async () => {
    restoreDns();
    await targets.close();
  });

  beforeEach(() => {
    targets.hits.public = 0;
    targets.hits.internal = 0;
    validationAnswer.addresses = [PUBLIC_IP];
    connectTimeAnswer.address = INTERNAL_IP;
  });

  it("control: a client given the hostname follows the connect-time answer to the internal address", async () => {
    const client = ldapjs.createClient({ url: `ldap://${REBIND_HOST}:${targets.port}` });
    client.on("error", ignore);
    client.on("connectError", ignore);

    await targets.waitForHit("internal");
    client.destroy();

    expect(targets.hits.public).toBe(0);
  });

  it("pinLdapTarget puts the validated IP in the URL", async () => {
    const { url } = await pinLdapTarget(`ldap://${REBIND_HOST}:${targets.port}/dc=example,dc=com`, undefined);
    expect(url).toBe(`ldap://${PUBLIC_IP}:${targets.port}/dc=example,dc=com`);
  });

  it("falls back to the next validated address when the first does not answer, as connecting by name would", async () => {
    validationAnswer.addresses = ["127.0.0.3", PUBLIC_IP];

    const { url } = await pinLdapTarget(`ldap://${REBIND_HOST}:${targets.port}`, undefined);

    expect(url).toBe(`ldap://${PUBLIC_IP}:${targets.port}`);
    expect(targets.hits.internal).toBe(0);
  });

  it("testLDAPConfig (config save and test) connects only to the validated address", async () => {
    await testLDAPConfig({
      url: `ldap://${REBIND_HOST}:${targets.port}`,
      bindDN: "cn=admin,dc=example,dc=com",
      bindPass: "password",
      caCert: ""
    });

    expect(targets.hits.public).toBeGreaterThan(0);
    expect(targets.hits.internal).toBe(0);
  });

  it("SSO and identity login options keep passport-ldapauth's client on the validated address", async () => {
    const { url, tlsOptions } = await pinLdapTarget(`ldap://${REBIND_HOST}:${targets.port}`, undefined);
    const auth = new LdapAuth({
      url,
      bindDN: "cn=admin,dc=example,dc=com",
      bindCredentials: "password",
      searchBase: "dc=example,dc=com",
      searchFilter: "(uid={{username}})",
      tlsOptions
    });
    auth.on("error", ignore);
    auth.authenticate("user", "password", ignore);

    await targets.waitForHit("public");
    auth.close(ignore);

    expect(targets.hits.internal).toBe(0);
  });

  it("the LDAP app connection connects only to the validated address", async () => {
    getLdapConnectionClient({
      provider: LdapProvider.ActiveDirectory,
      url: `ldap://${REBIND_HOST}:${targets.port}`,
      dn: "cn=admin",
      password: "password"
    }).catch(ignore);

    await targets.waitForHit("public");

    expect(targets.hits.internal).toBe(0);
  });

  it("refuses before connecting when the validated answer is internal", async () => {
    validationAnswer.addresses = [INTERNAL_IP];

    await expect(pinLdapTarget(`ldap://${REBIND_HOST}:${targets.port}`, undefined)).rejects.toThrow(
      "The LDAP server URL resolves to a private or local IP address"
    );
    expect(targets.hits.public + targets.hits.internal).toBe(0);
  });

  it("tells a self-hosted instance how to allow an LDAP server on its internal network", async () => {
    validationAnswer.addresses = [INTERNAL_IP];

    await expect(
      testLDAPConfig({ url: `ldap://${REBIND_HOST}:${targets.port}`, bindDN: "cn=admin", bindPass: "x", caCert: "" })
    ).rejects.toThrow("set the ALLOW_INTERNAL_IP_CONNECTIONS environment variable to true");
  });

  it("testLDAPConfig reports an unresolvable host as a failed connection instead of throwing", async () => {
    await expect(
      testLDAPConfig({ url: "ldap://unresolvable.invalid:389", bindDN: "cn=admin", bindPass: "x", caCert: "" })
    ).resolves.toBe(false);
  });
});

describe("ldaps after pinning", () => {
  let restoreDns: () => void;

  beforeAll(() => {
    restoreDns = installConnectTimeDns();
    validationAnswer.addresses = [PUBLIC_IP];
    connectTimeAnswer.address = INTERNAL_IP;
  });

  afterAll(() => restoreDns());

  const connectOverTls = async (certHostname: string) => {
    const { key, cert } = createSelfSignedCert(certHostname);
    const targets = await startTargetPair(() => tls.createServer({ key, cert }, ignore));
    const { url, tlsOptions } = await pinLdapTarget(`ldaps://${REBIND_HOST}:${targets.port}`, { ca: [cert] });

    const client = ldapjs.createClient({ url, tlsOptions });
    const outcome = await new Promise<{ connected: boolean; code?: string }>((resolve) => {
      client.on("connect", () => resolve({ connected: true }));
      const onError = (err: NodeJS.ErrnoException) => resolve({ connected: false, code: err.code });
      client.on("error", onError);
      client.on("connectError", onError);
    });
    client.destroy();
    await targets.close();

    return { outcome, hits: { ...targets.hits } };
  };

  it("completes the TLS handshake against the configured hostname while connected to the validated IP", async () => {
    const { outcome, hits } = await connectOverTls(REBIND_HOST);

    expect(outcome).toEqual({ connected: true });
    expect(hits).toEqual({ public: 1, internal: 0 });
  });

  it("still rejects a certificate issued for a different name", async () => {
    const { outcome, hits } = await connectOverTls("other.invalid");

    expect(outcome).toEqual({ connected: false, code: "ERR_TLS_CERT_ALTNAME_INVALID" });
    expect(hits.internal).toBe(0);
  });
});
