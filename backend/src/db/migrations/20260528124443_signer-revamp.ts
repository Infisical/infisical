/* eslint-disable no-await-in-loop */
import { Knex } from "knex";

import { TableName } from "../schemas";

const DEFAULT_RENEW_BEFORE_DAYS = 7;
const DEFAULT_CERT_TTL_DAYS = 365;
const SIGNER_SCOPE_TYPE = "signer";
const CERT_CODE_SIGNING_POLICY_TYPE = "cert-code-signing";
const SIGNER_ISSUANCE_JOBS_TABLE = "pki_signer_issuance_jobs";

type SignerRow = {
  id: string;
  projectId: string;
  name: string;
  approvalPolicyId: string | null;
  certificateId: string | null;
  caId: string | null;
  commonName: string | null;
  certificateTtlDays: number | null;
  renewBeforeDays: number | null;
};

export async function up(knex: Knex): Promise<void> {
  const hasCaId = await knex.schema.hasColumn(TableName.PkiSigners, "caId");
  const hasCommonName = await knex.schema.hasColumn(TableName.PkiSigners, "commonName");
  const hasTtl = await knex.schema.hasColumn(TableName.PkiSigners, "certificateTtlDays");
  const hasRenewBefore = await knex.schema.hasColumn(TableName.PkiSigners, "renewBeforeDays");
  const hasFailureReason = await knex.schema.hasColumn(TableName.PkiSigners, "failureReason");
  const hasKeyAlgorithm = await knex.schema.hasColumn(TableName.PkiSigners, "keyAlgorithm");

  if (!hasCaId || !hasCommonName || !hasTtl || !hasRenewBefore || !hasFailureReason || !hasKeyAlgorithm) {
    await knex.schema.alterTable(TableName.PkiSigners, (t) => {
      if (!hasCaId) {
        t.uuid("caId").nullable();
        t.foreign("caId").references("id").inTable(TableName.CertificateAuthority).onDelete("SET NULL");
        t.index("caId");
      }
      if (!hasCommonName) t.string("commonName", 256).nullable();
      if (!hasTtl) t.integer("certificateTtlDays").nullable();
      if (!hasRenewBefore) t.integer("renewBeforeDays").nullable();
      if (!hasFailureReason) t.text("failureReason").nullable();
      if (!hasKeyAlgorithm) t.string("keyAlgorithm", 64).notNullable().defaultTo("RSA_2048");
    });
  }

  await knex.schema.alterTable(TableName.PkiSigners, (t) => {
    t.uuid("certificateId").nullable().alter();
  });

  if (!(await knex.schema.hasColumn(TableName.ApprovalRequestGrants, "grantedByUserId"))) {
    await knex.schema.alterTable(TableName.ApprovalRequestGrants, (t) => {
      t.uuid("grantedByUserId").nullable();
      t.foreign("grantedByUserId").references("id").inTable(TableName.Users).onDelete("SET NULL");
      t.index("grantedByUserId");
    });
  }

  if (!(await knex.schema.hasTable(SIGNER_ISSUANCE_JOBS_TABLE))) {
    await knex.schema.createTable(SIGNER_ISSUANCE_JOBS_TABLE, (t) => {
      t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));

      t.uuid("signerId").notNullable();
      t.foreign("signerId").references("id").inTable(TableName.PkiSigners).onDelete("CASCADE");
      t.index("signerId");

      t.uuid("caId").notNullable();
      t.foreign("caId").references("id").inTable(TableName.CertificateAuthority).onDelete("CASCADE");

      t.string("caType", 64).notNullable();
      t.string("status", 32).notNullable();

      t.string("commonName", 256).notNullable();
      t.integer("certificateTtlDays").notNullable();
      t.string("keyAlgorithm", 64).notNullable().defaultTo("RSA_2048");

      t.binary("encryptedPrivateKey");
      t.binary("encryptedCsr");

      t.jsonb("externalOrderRef");

      t.integer("attempts").notNullable().defaultTo(0);
      t.integer("maxAttempts").notNullable().defaultTo(100);
      t.timestamp("nextPollAt", { useTz: true }).notNullable().defaultTo(knex.fn.now());
      t.timestamp("lastAttemptAt", { useTz: true });

      t.text("failureReason");

      t.uuid("certificateId");
      t.foreign("certificateId").references("id").inTable(TableName.Certificate).onDelete("SET NULL");

      t.timestamps(true, true, true);

      t.index(["status", "nextPollAt"], "pki_signer_issuance_jobs_status_nextPollAt_idx");
    });
  }

  await knex(TableName.ApprovalRequests)
    .where({ type: "cert-code-signing" })
    .andWhereRaw(`("requestData" -> 'version') IS DISTINCT FROM to_jsonb(1)`)
    .del();

  const signers = (await knex(TableName.PkiSigners).select<SignerRow[]>(
    "id",
    "projectId",
    "name",
    "approvalPolicyId",
    "certificateId",
    "caId",
    "commonName",
    "certificateTtlDays",
    "renewBeforeDays"
  )) as SignerRow[];

  for (const signer of signers) {
    await knex.transaction(async (tx) => {
      const project = await tx(TableName.Project)
        .where({ id: signer.projectId })
        .first<{ orgId: string } | undefined>("orgId");
      if (!project) return;

      const EMPTY_JSONB = JSON.stringify({});

      let policyId: string;
      if (!signer.approvalPolicyId) {
        const [created] = await tx(TableName.ApprovalPolicies)
          .insert({
            projectId: signer.projectId,
            organizationId: project.orgId,
            type: CERT_CODE_SIGNING_POLICY_TYPE,
            name: `signer:${signer.id}`,
            scopeType: SIGNER_SCOPE_TYPE,
            scopeId: signer.id,
            conditions: EMPTY_JSONB,
            constraints: EMPTY_JSONB
          })
          .returning<{ id: string }[]>("id");
        policyId = created.id;
        await tx(TableName.PkiSigners).where({ id: signer.id }).update({ approvalPolicyId: policyId });
      } else {
        const otherCount = await tx(TableName.PkiSigners)
          .where({ approvalPolicyId: signer.approvalPolicyId })
          .andWhereNot({ id: signer.id })
          .count<{ count: string }[]>("id as count")
          .first();
        const isShared = Number(otherCount?.count ?? 0) > 0;
        if (isShared) {
          const oldPolicy = await tx(TableName.ApprovalPolicies).where({ id: signer.approvalPolicyId }).first<
            | {
                name: string;
                constraints: unknown;
                conditions: unknown;
                maxRequestTtl: string | null;
                enforcementLevel: string | null;
              }
            | undefined
          >("name", "constraints", "conditions", "maxRequestTtl", "enforcementLevel");
          const [created] = await tx(TableName.ApprovalPolicies)
            .insert({
              projectId: signer.projectId,
              organizationId: project.orgId,
              type: CERT_CODE_SIGNING_POLICY_TYPE,
              name: `signer:${signer.id}`,
              scopeType: SIGNER_SCOPE_TYPE,
              scopeId: signer.id,
              constraints: oldPolicy?.constraints ?? EMPTY_JSONB,
              conditions: oldPolicy?.conditions ?? EMPTY_JSONB,
              maxRequestTtl: oldPolicy?.maxRequestTtl ?? null,
              enforcementLevel: oldPolicy?.enforcementLevel ?? "hard"
            })
            .returning<{ id: string }[]>("id");
          policyId = created.id;

          const oldSteps = await tx(TableName.ApprovalPolicySteps)
            .where({ policyId: signer.approvalPolicyId })
            .select("stepNumber", "requiredApprovals", "name", "notifyApprovers");
          for (const step of oldSteps) {
            await tx(TableName.ApprovalPolicySteps).insert({
              policyId,
              stepNumber: step.stepNumber,
              requiredApprovals: step.requiredApprovals,
              name: (step.name as string) ?? null,
              notifyApprovers: (step.notifyApprovers as boolean) ?? false
            });
          }

          await tx(TableName.PkiSigners).where({ id: signer.id }).update({ approvalPolicyId: policyId });
        } else {
          await tx(TableName.ApprovalPolicies)
            .where({ id: signer.approvalPolicyId })
            .update({ scopeType: SIGNER_SCOPE_TYPE, scopeId: signer.id });
          policyId = signer.approvalPolicyId;
        }
      }

      const stepIds = (await tx(TableName.ApprovalPolicySteps).where({ policyId }).select<{ id: string }[]>("id")).map(
        (r) => r.id
      );
      if (stepIds.length > 0) {
        await tx(TableName.ApprovalPolicyStepApprovers).whereIn("policyStepId", stepIds).delete();
      }

      if (signer.certificateId) {
        const cert = await tx(TableName.Certificate)
          .where({ id: signer.certificateId })
          .first<
            { caId: string | null; commonName: string; notBefore: Date; notAfter: Date } | undefined
          >("caId", "commonName", "notBefore", "notAfter");

        if (cert) {
          const patch: Record<string, unknown> = {};
          if (!signer.commonName) patch.commonName = cert.commonName;
          if (!signer.certificateTtlDays) {
            const msSpan = new Date(cert.notAfter).getTime() - new Date(cert.notBefore).getTime();
            const days = Math.max(1, Math.round(msSpan / (24 * 60 * 60 * 1000)));
            patch.certificateTtlDays = Number.isFinite(days) && days > 0 ? days : DEFAULT_CERT_TTL_DAYS;
          }
          if (!signer.renewBeforeDays) patch.renewBeforeDays = DEFAULT_RENEW_BEFORE_DAYS;
          if (!signer.caId && cert.caId) {
            const ca = await tx(TableName.CertificateAuthority)
              .where({ id: cert.caId, projectId: signer.projectId })
              .first<{ id: string } | undefined>("id");
            if (ca) patch.caId = ca.id;
          }
          if (Object.keys(patch).length > 0) {
            await tx(TableName.PkiSigners).where({ id: signer.id }).update(patch);
          }
        } else if (!signer.renewBeforeDays) {
          await tx(TableName.PkiSigners)
            .where({ id: signer.id })
            .update({ renewBeforeDays: DEFAULT_RENEW_BEFORE_DAYS });
        }
      } else if (!signer.renewBeforeDays) {
        await tx(TableName.PkiSigners).where({ id: signer.id }).update({ renewBeforeDays: DEFAULT_RENEW_BEFORE_DAYS });
      }
    });
  }

  const signerMemberships = (await knex(TableName.Membership)
    .where({ scope: "resource", scopeResourceType: SIGNER_SCOPE_TYPE })
    .select<{ id: string }[]>("id")) as { id: string }[];
  if (signerMemberships.length > 0) {
    const ids = signerMemberships.map((m) => m.id);
    await knex(TableName.MembershipRole).whereIn("membershipId", ids).delete();
    await knex(TableName.Membership).whereIn("id", ids).delete();
  }

  await knex.schema.alterTable(TableName.PkiSigners, (t) => {
    t.uuid("approvalPolicyId").notNullable().alter();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(SIGNER_ISSUANCE_JOBS_TABLE);

  if (await knex.schema.hasColumn(TableName.ApprovalRequestGrants, "grantedByUserId")) {
    await knex.schema.alterTable(TableName.ApprovalRequestGrants, (t) => {
      t.dropIndex("grantedByUserId");
      t.dropForeign(["grantedByUserId"]);
      t.dropColumn("grantedByUserId");
    });
  }

  await knex.schema.alterTable(TableName.PkiSigners, (t) => {
    t.uuid("approvalPolicyId").nullable().alter();
  });

  const orphans = await knex(TableName.PkiSigners).whereNull("certificateId").count<{ count: string }[]>("id as count");
  const orphanCount = Number(orphans?.[0]?.count ?? 0);
  if (orphanCount === 0) {
    await knex.schema.alterTable(TableName.PkiSigners, (t) => {
      t.uuid("certificateId").notNullable().alter();
    });
  }

  const hasKeyAlgorithm = await knex.schema.hasColumn(TableName.PkiSigners, "keyAlgorithm");
  const hasFailureReason = await knex.schema.hasColumn(TableName.PkiSigners, "failureReason");
  const hasRenewBefore = await knex.schema.hasColumn(TableName.PkiSigners, "renewBeforeDays");
  const hasTtl = await knex.schema.hasColumn(TableName.PkiSigners, "certificateTtlDays");
  const hasCommonName = await knex.schema.hasColumn(TableName.PkiSigners, "commonName");
  const hasCaId = await knex.schema.hasColumn(TableName.PkiSigners, "caId");

  await knex.schema.alterTable(TableName.PkiSigners, (t) => {
    if (hasKeyAlgorithm) t.dropColumn("keyAlgorithm");
    if (hasFailureReason) t.dropColumn("failureReason");
    if (hasRenewBefore) t.dropColumn("renewBeforeDays");
    if (hasTtl) t.dropColumn("certificateTtlDays");
    if (hasCommonName) t.dropColumn("commonName");
    if (hasCaId) {
      t.dropIndex("caId");
      t.dropForeign(["caId"]);
      t.dropColumn("caId");
    }
  });
}
