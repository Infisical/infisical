import { generateKeyPairSync } from "node:crypto";

import * as x509 from "@peculiar/x509";

import { OrgMembershipRole } from "@app/db/schemas";
import { seedData1 } from "@app/db/seed-data";

const HOUR = 3600;
const MONTH = 2592000;

const makeCaCertificate = async () => {
  const keys = await globalThis.crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
    "sign",
    "verify"
  ]);
  const cert = await x509.X509CertificateGenerator.createSelfSigned({
    serialNumber: "01",
    name: "CN=identity-auth-update-ttl",
    notBefore: new Date(Date.now() - HOUR * 1000),
    notAfter: new Date(Date.now() + HOUR * 1000),
    keys,
    signingAlgorithm: { name: "ECDSA", hash: "SHA-256" },
    extensions: [new x509.BasicConstraintsExtension(true, undefined, true)]
  });
  return cert.toString("pem");
};

const makeSpiffeBundle = () => {
  const { publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  return JSON.stringify({ keys: [{ ...publicKey.export({ format: "jwk" }), use: "jwt-svid", kid: "key-1" }] });
};

const authMethods: { name: string; path: string; attachBody: () => Promise<Record<string, unknown>> }[] = [
  {
    name: "AliCloud",
    path: "alicloud-auth",
    attachBody: async () => ({ allowedArns: "acs:ram::1234567890123456:user/test" })
  },
  {
    name: "OCI",
    path: "oci-auth",
    attachBody: async () => ({ tenancyOcid: "ocid1.tenancy.oc1..aaaaexample", allowedUsernames: "user1" })
  },
  {
    name: "TLS certificate",
    path: "tls-cert-auth",
    attachBody: async () => ({ caCertificate: await makeCaCertificate() })
  },
  {
    name: "SPIFFE",
    path: "spiffe-auth",
    attachBody: async () => ({
      trustDomain: "example.org",
      allowedSpiffeIds: "spiffe://example.org/*",
      allowedAudiences: "infisical",
      trustBundleDistribution: { profile: "static", bundle: makeSpiffeBundle() }
    })
  }
];

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

const deleteIdentity = (identityId: string) =>
  testServer.inject({
    method: "DELETE",
    url: `/api/v1/identities/${identityId}`,
    headers: { authorization: `Bearer ${jwtAuthToken}` }
  });

// The stored TTLs are bigint columns, so they come back from the database as strings. An update that omits both
// TTL fields must compare them as numbers: as strings, "3600" > "2592000" and the update is wrongly rejected.
describe.each(authMethods)("$name auth update TTL validation", ({ name, path, attachBody }) => {
  const withAuthMethod = async (callback: (identityId: string, body: Record<string, unknown>) => Promise<void>) => {
    const identity = await createIdentity(`update-ttl-${path}`);
    try {
      const body = await attachBody();
      const attachRes = await testServer.inject({
        method: "POST",
        url: `/api/v1/auth/${path}/identities/${identity.id}`,
        headers: { authorization: `Bearer ${jwtAuthToken}` },
        body: { ...body, accessTokenTTL: HOUR, accessTokenMaxTTL: MONTH }
      });
      expect(attachRes.statusCode).toBe(200);
      await callback(identity.id, body);
    } finally {
      await deleteIdentity(identity.id);
    }
  };

  const update = (identityId: string, body: Record<string, unknown>) =>
    testServer.inject({
      method: "PATCH",
      url: `/api/v1/auth/${path}/identities/${identityId}`,
      headers: { authorization: `Bearer ${jwtAuthToken}` },
      body
    });

  test(`accepts an update that leaves both TTLs unchanged (${name})`, async () => {
    await withAuthMethod(async (identityId, body) => {
      const res = await update(identityId, { ...body, accessTokenNumUsesLimit: 5 });
      expect(res.statusCode).toBe(200);
    });
  });

  test(`still rejects a max TTL below the stored TTL (${name})`, async () => {
    await withAuthMethod(async (identityId, body) => {
      const res = await update(identityId, { ...body, accessTokenMaxTTL: HOUR / 2 });
      expect(res.statusCode).toBe(400);
    });
  });
});
