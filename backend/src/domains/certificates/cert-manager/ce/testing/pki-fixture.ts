import { randomUUID } from "node:crypto";

import { TDbClient } from "@app/db";
import { ProjectType, TableName } from "@app/db/schemas";
import { TPlatformFactories } from "@app/domains/lib/testing/integration/factories";

const DAY = 24 * 60 * 60 * 1000;

// A root org and a sub-org, each with a Certificate Manager project, and helpers to add PKI rows to them.
export const seedPkiOrgs = async (db: TDbClient, factories: TPlatformFactories) => {
  const root = await factories.organization();
  const sub = await factories.organization({ rootOrgId: root.id, parentOrgId: root.id });
  const { project: rootProject } = await factories.project({
    orgId: root.id,
    type: ProjectType.CertificateManager,
    environments: []
  });
  const { project: subProject } = await factories.project({
    orgId: sub.id,
    type: ProjectType.CertificateManager,
    environments: []
  });

  const internalCa = async (projectId: string) => {
    const [ca] = await db(TableName.CertificateAuthority)
      .insert({ projectId, status: "active", name: `ca-${randomUUID().slice(0, 8)}` })
      .returning("*");
    await db(TableName.InternalCertificateAuthority).insert({
      caId: ca.id,
      type: "root",
      friendlyName: "ca",
      organization: "",
      ou: "",
      country: "",
      province: "",
      locality: "",
      commonName: "ca",
      dn: "CN=ca",
      keyAlgorithm: "RSA_2048"
    });
    return ca;
  };

  const certificate = async (
    projectId: string,
    name: string,
    { expired = false, revoked = false }: { expired?: boolean; revoked?: boolean } = {}
  ) => {
    const [cert] = await db(TableName.Certificate)
      .insert({
        projectId,
        status: revoked ? "revoked" : "active",
        serialNumber: randomUUID(),
        friendlyName: name,
        commonName: name,
        notBefore: new Date(Date.now() - DAY),
        notAfter: new Date(Date.now() + (expired ? -1 : 30) * DAY),
        quotaKey: name,
        hasWildcard: name.startsWith("*.")
      })
      .returning("*");
    return cert;
  };

  // A code-signing signer whose certificate carries this name; its whole chain is excluded from the quota.
  const signer = async (projectId: string, name: string) => {
    const cert = await certificate(projectId, name);
    await db(TableName.PkiSigners).insert({
      projectId,
      name: `signer-${randomUUID().slice(0, 8)}`,
      certificateId: cert.id
    });
  };

  return { root, sub, rootProject, subProject, internalCa, certificate, signer };
};
