import crypto from "node:crypto";

import * as x509 from "@peculiar/x509";
import { GeneralName, GeneralSubtree, NameConstraints } from "pkijs";

import { OrgMembershipRole } from "@app/db/schemas";
import { seedData1 } from "@app/db/seed-data";

const KEY_ALGORITHM: EcKeyGenParams = { name: "ECDSA", namedCurve: "P-256" };
const SIGNING_ALGORITHM: EcdsaParams = { name: "ECDSA", hash: "SHA-256" };

const CLIENT_AUTH_EKU = "1.3.6.1.5.5.7.3.2";
const SERVER_AUTH_EKU = "1.3.6.1.5.5.7.3.1";

const NOT_BEFORE = new Date(Date.now() - 60 * 60 * 1000);
const NOT_AFTER = new Date(Date.now() + 60 * 60 * 1000);

type TIssued = { cert: x509.X509Certificate; keys: CryptoKeyPair };

let serial = 0x1000;
const nextSerial = () => {
  serial += 1;
  return serial.toString(16);
};

const generateKeys = () => crypto.webcrypto.subtle.generateKey(KEY_ALGORITHM, true, ["sign", "verify"]);

const ekuExtension = (usages: string[]) => new x509.ExtendedKeyUsageExtension(usages, true);

const permittedDnsConstraint = (permitted: string[]) =>
  new x509.Extension(
    "2.5.29.30",
    true,
    new NameConstraints({
      permittedSubtrees: permitted.map((dns) => new GeneralSubtree({ base: new GeneralName({ type: 2, value: dns }) }))
    })
      .toSchema()
      .toBER(false)
  );

const permittedUriConstraint = (permitted: string[]) =>
  new x509.Extension(
    "2.5.29.30",
    true,
    new NameConstraints({
      permittedSubtrees: permitted.map((uri) => new GeneralSubtree({ base: new GeneralName({ type: 6, value: uri }) }))
    })
      .toSchema()
      .toBER(false)
  );

const makeRoot = async (name: string, extraExtensions: x509.Extension[] = []): Promise<TIssued> => {
  const keys = await generateKeys();
  const cert = await x509.X509CertificateGenerator.createSelfSigned({
    serialNumber: nextSerial(),
    name: `CN=${name}`,
    notBefore: NOT_BEFORE,
    notAfter: NOT_AFTER,
    keys,
    signingAlgorithm: SIGNING_ALGORITHM,
    extensions: [new x509.BasicConstraintsExtension(true, undefined, true), ...extraExtensions]
  });
  return { cert, keys };
};

const makeIntermediate = async (
  name: string,
  issuer: TIssued,
  opts?: { pathLength?: number; extraExtensions?: x509.Extension[]; keys?: CryptoKeyPair }
): Promise<TIssued> => {
  const keys = opts?.keys ?? (await generateKeys());
  const cert = await x509.X509CertificateGenerator.create({
    serialNumber: nextSerial(),
    subject: `CN=${name}`,
    issuer: issuer.cert.subject,
    notBefore: NOT_BEFORE,
    notAfter: NOT_AFTER,
    signingKey: issuer.keys.privateKey,
    publicKey: keys.publicKey,
    signingAlgorithm: SIGNING_ALGORITHM,
    extensions: [new x509.BasicConstraintsExtension(true, opts?.pathLength, true), ...(opts?.extraExtensions ?? [])]
  });
  return { cert, keys };
};

const makeLeaf = async (
  name: string,
  issuer: TIssued,
  opts?: { usages?: string[]; dnsName?: string; uri?: string }
): Promise<TIssued> => {
  const keys = await generateKeys();
  const cert = await x509.X509CertificateGenerator.create({
    serialNumber: nextSerial(),
    subject: `CN=${name}`,
    issuer: issuer.cert.subject,
    notBefore: NOT_BEFORE,
    notAfter: NOT_AFTER,
    signingKey: issuer.keys.privateKey,
    publicKey: keys.publicKey,
    signingAlgorithm: SIGNING_ALGORITHM,
    extensions: [
      new x509.BasicConstraintsExtension(false),
      ...(opts?.usages ? [ekuExtension(opts.usages)] : []),
      ...(opts?.dnsName ? [new x509.SubjectAlternativeNameExtension([{ type: "dns", value: opts.dnsName }])] : []),
      ...(opts?.uri ? [new x509.SubjectAlternativeNameExtension([{ type: "url", value: opts.uri }])] : [])
    ]
  });
  return { cert, keys };
};

const toPem = (cert: x509.X509Certificate) => cert.toString("pem");

const createIdentity = async (name: string) => {
  const res = await testServer.inject({
    method: "POST",
    url: "/api/v1/identities",
    body: { name, role: OrgMembershipRole.Member, organizationId: seedData1.organization.id },
    headers: { authorization: `Bearer ${jwtAuthToken}` }
  });
  expect(res.statusCode).toBe(200);
  return res.json().identity as { id: string };
};

const deleteIdentity = async (identityId: string) => {
  const res = await testServer.inject({
    method: "DELETE",
    url: `/api/v1/identities/${identityId}`,
    headers: { authorization: `Bearer ${jwtAuthToken}` }
  });
  expect(res.statusCode).toBe(200);
};

const attachTlsCertAuth = (identityId: string, caCertificate: string, verifyClientCertificateChain: boolean) =>
  testServer.inject({
    method: "POST",
    url: `/api/v1/auth/tls-cert-auth/identities/${identityId}`,
    headers: { authorization: `Bearer ${jwtAuthToken}` },
    body: { caCertificate, verifyClientCertificateChain }
  });

const loginWithHeader = (identityId: string, clientCertHeader: string) =>
  testServer.inject({
    method: "POST",
    url: "/api/v1/auth/tls-cert-auth/login",
    headers: { "x-identity-tls-cert-auth-client-cert": clientCertHeader },
    body: { identityId }
  });

const login = (identityId: string, chain: x509.X509Certificate[]) =>
  loginWithHeader(identityId, encodeURIComponent(chain.map(toPem).join("")));

// PEM markers around something that is not a certificate: the chain splitter accepts it and Node's
// OpenSSL-backed parser is what rejects it.
const UNDECODABLE_PEM = "-----BEGIN CERTIFICATE-----\nZm9vYmFy\n-----END CERTIFICATE-----\n";

/**
 * Drives the real login route end to end: the CA certificate is stored through the API (KMS
 * encrypted), and the client chain arrives in the header a TLS-terminating proxy would set.
 */
const withIdentity = async (
  opts: { caCertificate: x509.X509Certificate; verifyChain: boolean },
  run: (identityId: string) => Promise<void>
) => {
  const identity = await createIdentity(`tls-cert-auth-${nextSerial()}`);
  try {
    const res = await attachTlsCertAuth(identity.id, toPem(opts.caCertificate), opts.verifyChain);
    expect(res.statusCode).toBe(200);
    await run(identity.id);
  } finally {
    await deleteIdentity(identity.id);
  }
};

describe("Identity TLS certificate auth v1", async () => {
  describe("direct issuer mode", async () => {
    test("issues an access token for a client certificate the configured CA issued", async () => {
      const ca = await makeRoot("Direct Mode CA");
      const leaf = await makeLeaf("workload", ca, { usages: [CLIENT_AUTH_EKU] });

      await withIdentity({ caCertificate: ca.cert, verifyChain: false }, async (identityId) => {
        const res = await login(identityId, [leaf.cert]);
        expect(res.statusCode).toBe(200);
        expect(res.json().accessToken).toEqual(expect.any(String));
        expect(res.json().tokenType).toBe("Bearer");
      });
    });

    test("denies a client certificate whose extended key usage omits client authentication", async () => {
      const ca = await makeRoot("Direct Mode CA");
      const leaf = await makeLeaf("workload", ca, { usages: [SERVER_AUTH_EKU] });

      await withIdentity({ caCertificate: ca.cert, verifyChain: false }, async (identityId) => {
        const res = await login(identityId, [leaf.cert]);
        expect(res.statusCode).toBe(401);
        expect(res.json().message).toContain("not valid for client authentication");
      });
    });

    // A CA that cannot delegate client authentication is refused when it is configured, so the
    // operator finds out then rather than through a login failure they have to trace back to it.
    test("refuses to attach a CA that may not issue for client authentication", async () => {
      const ca = await makeRoot("ServerAuth Only CA", [ekuExtension([SERVER_AUTH_EKU])]);
      const identity = await createIdentity(`tls-cert-auth-${nextSerial()}`);

      try {
        const res = await attachTlsCertAuth(identity.id, toPem(ca.cert), false);
        expect(res.statusCode).toBe(400);
        expect(res.json().message).toContain("does not include client authentication");
      } finally {
        await deleteIdentity(identity.id);
      }
    });

    // A URI name constraint restricts the host, so one written the way a SPIFFE ID looks matches
    // nothing and would deny every login. Refusing it at attach names the CA as the problem.
    test("refuses to attach a CA whose URI name constraint is not a domain", async () => {
      const ca = await makeRoot("Scheme URI CA", [permittedUriConstraint(["spiffe://example.org"])]);
      const identity = await createIdentity(`tls-cert-auth-${nextSerial()}`);

      try {
        const res = await attachTlsCertAuth(identity.id, toPem(ca.cert), false);
        expect(res.statusCode).toBe(400);
        expect(res.json().message).toContain("is not a fully qualified domain name");
      } finally {
        await deleteIdentity(identity.id);
      }
    });

    test("attaches a CA whose URI name constraint is a domain", async () => {
      const ca = await makeRoot("Domain URI CA", [permittedUriConstraint(["example.org"])]);
      const leaf = await makeLeaf("workload", ca, {
        usages: [CLIENT_AUTH_EKU],
        uri: "spiffe://example.org/ns/default/sa/svc"
      });

      await withIdentity({ caCertificate: ca.cert, verifyChain: false }, async (identityId) => {
        const res = await login(identityId, [leaf.cert]);
        expect(res.statusCode).toBe(200);
      });
    });
  });

  describe("trust anchor mode", async () => {
    test("issues an access token for a leaf presented with its intermediate", async () => {
      const root = await makeRoot("Stable Root CA");
      const intermediate = await makeIntermediate("Rotating Intermediate CA", root);
      const leaf = await makeLeaf("workload", intermediate, { usages: [CLIENT_AUTH_EKU] });

      await withIdentity({ caCertificate: root.cert, verifyChain: true }, async (identityId) => {
        const res = await login(identityId, [leaf.cert, intermediate.cert]);
        expect(res.statusCode).toBe(200);
        expect(res.json().accessToken).toEqual(expect.any(String));
      });
    });

    test("denies a chain through an intermediate that may not delegate client authentication", async () => {
      const root = await makeRoot("Stable Root CA");
      const serverOnly = await makeIntermediate("ServerAuth Only Intermediate", root, {
        extraExtensions: [ekuExtension([SERVER_AUTH_EKU])]
      });
      const leaf = await makeLeaf("workload", serverOnly, { usages: [CLIENT_AUTH_EKU] });

      await withIdentity({ caCertificate: root.cert, verifyChain: true }, async (identityId) => {
        const res = await login(identityId, [leaf.cert, serverOnly.cert]);
        expect(res.statusCode).toBe(401);
        expect(res.json().message).toContain("A CA in the certificate chain is not permitted");
      });
    });

    test("denies a leaf named outside its issuing CA's permitted namespace", async () => {
      const root = await makeRoot("Stable Root CA");
      const constrained = await makeIntermediate("Constrained Intermediate CA", root, {
        extraExtensions: [permittedDnsConstraint(["team-a.example.com"])]
      });
      const leaf = await makeLeaf("victim.example.com", constrained, {
        usages: [CLIENT_AUTH_EKU],
        dnsName: "victim.example.com"
      });

      await withIdentity({ caCertificate: root.cert, verifyChain: true }, async (identityId) => {
        const res = await login(identityId, [leaf.cert, constrained.cert]);
        expect(res.statusCode).toBe(401);
        expect(res.json().message).toContain("outside the namespace its issuing CA is permitted to certify");
      });
    });

    // The anchor is screened when it is configured, but a presented intermediate is not, so the
    // login has to report the CA rather than the client's name.
    test("denies a chain through an intermediate whose URI name constraint is not a domain", async () => {
      const root = await makeRoot("Stable Root CA");
      const constrained = await makeIntermediate("Scheme URI Intermediate CA", root, {
        extraExtensions: [permittedUriConstraint(["spiffe://example.org"])]
      });
      const leaf = await makeLeaf("workload", constrained, {
        usages: [CLIENT_AUTH_EKU],
        uri: "spiffe://example.org/ns/default/sa/svc"
      });

      await withIdentity({ caCertificate: root.cert, verifyChain: true }, async (identityId) => {
        const res = await login(identityId, [leaf.cert, constrained.cert]);
        expect(res.statusCode).toBe(401);
        expect(res.json().message).toContain("is not a fully qualified domain name");
      });
    });

    test("denies a chain deeper than a CA's path length permits", async () => {
      const root = await makeRoot("Stable Root CA");
      const limited = await makeIntermediate("PathLen Zero CA", root, { pathLength: 0 });
      const extra = await makeIntermediate("Extra Intermediate CA", limited);
      const leaf = await makeLeaf("workload", extra, { usages: [CLIENT_AUTH_EKU] });

      await withIdentity({ caCertificate: root.cert, verifyChain: true }, async (identityId) => {
        const res = await login(identityId, [leaf.cert, limited.cert, extra.cert]);
        expect(res.statusCode).toBe(401);
        expect(res.json().message).toContain("more intermediate CAs than a CA in it permits");
      });
    });

    test("issues an access token when a cross-signed alternative path satisfies the constraints", async () => {
      // The issuing CA is cross-signed: the copy under the pathLen:0 parent is presented first, so
      // a search that commits to the first signature-valid path would deny a client that has a
      // valid path available through the unconstrained parent.
      const root = await makeRoot("Stable Root CA");
      const constrainedParent = await makeIntermediate("PathLen Zero Parent CA", root, { pathLength: 0 });
      const openParent = await makeIntermediate("Unconstrained Parent CA", root);

      const sharedKeys = await generateKeys();
      const viaConstrained = await makeIntermediate("Shared Issuing CA", constrainedParent, { keys: sharedKeys });
      const viaOpen = await makeIntermediate("Shared Issuing CA", openParent, { keys: sharedKeys });
      const leaf = await makeLeaf("workload", viaOpen, { usages: [CLIENT_AUTH_EKU] });

      await withIdentity({ caCertificate: root.cert, verifyChain: true }, async (identityId) => {
        const res = await login(identityId, [
          leaf.cert,
          constrainedParent.cert,
          openParent.cert,
          viaConstrained.cert,
          viaOpen.cert
        ]);
        expect(res.statusCode).toBe(200);
        expect(res.json().accessToken).toEqual(expect.any(String));
      });
    });
  });

  // Certificate material the proxy forwards but nothing can parse. Each of these reached OpenSSL or
  // decodeURIComponent unguarded and surfaced as a 500, which tells the caller nothing and keeps the
  // attempt out of the audit log.
  describe("malformed certificate material", async () => {
    test("rejects a client certificate header that is not URL-encoded", async () => {
      const ca = await makeRoot("Malformed Header CA");

      await withIdentity({ caCertificate: ca.cert, verifyChain: false }, async (identityId) => {
        const res = await loginWithHeader(identityId, "%zz-----BEGIN CERTIFICATE-----");
        expect(res.statusCode).toBe(400);
        expect(res.json().message).toContain("not valid URL-encoded data");
      });
    });

    test("denies a client certificate that cannot be decoded", async () => {
      const ca = await makeRoot("Undecodable Leaf CA");

      await withIdentity({ caCertificate: ca.cert, verifyChain: false }, async (identityId) => {
        const res = await loginWithHeader(identityId, encodeURIComponent(UNDECODABLE_PEM));
        expect(res.statusCode).toBe(401);
        expect(res.json().message).toContain("client certificate could not be decoded");
      });
    });

    test("denies a presented chain carrying a certificate that cannot be decoded", async () => {
      const root = await makeRoot("Undecodable Chain Root CA");
      const intermediate = await makeIntermediate("Rotating Intermediate CA", root);
      const leaf = await makeLeaf("workload", intermediate, { usages: [CLIENT_AUTH_EKU] });

      await withIdentity({ caCertificate: root.cert, verifyChain: true }, async (identityId) => {
        const res = await loginWithHeader(
          identityId,
          encodeURIComponent(toPem(leaf.cert) + toPem(intermediate.cert) + UNDECODABLE_PEM)
        );
        expect(res.statusCode).toBe(401);
        expect(res.json().message).toContain("presented chain could not be decoded");
      });
    });
  });
});
