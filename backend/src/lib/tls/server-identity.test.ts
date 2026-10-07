import tls from "node:tls";

import { getTlsServerIdentityOptions } from "./server-identity";

const certWithSans = (subjectaltname: string) => ({ subject: {}, subjectaltname }) as unknown as tls.PeerCertificate;

describe("getTlsServerIdentityOptions", () => {
  test("passes a host name through as SNI", () => {
    expect(getTlsServerIdentityOptions("db.example.com")).toEqual({ servername: "db.example.com" });
  });

  test("returns nothing for an empty host", () => {
    expect(getTlsServerIdentityOptions(undefined)).toEqual({});
    expect(getTlsServerIdentityOptions("")).toEqual({});
  });

  test.each(["18.235.6.158", "::1", "[::1]"])("never sets SNI for the IP literal %s", (host) => {
    const options = getTlsServerIdentityOptions(host);
    expect(options.servername).toBeUndefined();
    expect(options.checkServerIdentity).toBeDefined();
  });

  test("verifies an IP against the certificate's IP SANs, not the socket host", () => {
    const { checkServerIdentity } = getTlsServerIdentityOptions("18.235.6.158");

    expect(checkServerIdentity?.("localhost", certWithSans("IP Address:18.235.6.158"))).toBeUndefined();
    expect(checkServerIdentity?.("localhost", certWithSans("IP Address:10.0.0.1"))).toBeInstanceOf(Error);
    expect(checkServerIdentity?.("localhost", certWithSans("DNS:localhost"))).toBeInstanceOf(Error);
  });

  test("unwraps a bracketed IPv6 literal", () => {
    const { checkServerIdentity } = getTlsServerIdentityOptions("[::1]");

    expect(checkServerIdentity?.("localhost", certWithSans("IP Address:0:0:0:0:0:0:0:1"))).toBeUndefined();
  });

  test("works with tls.connect on an IP literal", () => {
    const socket = tls.connect({ host: "127.0.0.1", port: 1, ...getTlsServerIdentityOptions("127.0.0.1") });
    socket.on("error", () => {});
    socket.destroy();
  });
});
