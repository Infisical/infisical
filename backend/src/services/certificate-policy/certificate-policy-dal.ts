import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName, TPkiCertificatePoliciesInsert } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify } from "@app/lib/knex";
import {
  applyProcessedPermissionRulesToQuery,
  type ProcessedPermissionRules
} from "@app/lib/knex/permission-filter-utils";

import { TCertificatePolicy, TCertificatePolicyInsert, TCertificatePolicyUpdate } from "./certificate-policy-types";

export type TCertificatePolicyDALFactory = ReturnType<typeof certificatePolicyDALFactory>;

interface CountResult {
  count: string;
}

export const certificatePolicyDALFactory = (db: TDbClient) => {
  const certificatePolicyOrm = ormify(db, TableName.PkiCertificatePolicy);

  const serializeJsonFields = (data: TCertificatePolicyInsert | TCertificatePolicyUpdate) => {
    const serialized = { ...data } as Record<string, unknown>;

    const jsonFields = ["subject", "sans", "keyUsages", "extendedKeyUsages", "algorithms", "validity", "caSettings"];

    jsonFields.forEach((field) => {
      const value = serialized[field];
      if (value !== undefined && typeof value !== "string") {
        serialized[field] = JSON.stringify(value);
      }
    });

    return serialized;
  };

  const parseJsonFields = (raw: Record<string, unknown>): TCertificatePolicy => {
    const jsonFields = ["subject", "sans", "keyUsages", "extendedKeyUsages", "algorithms", "validity", "caSettings"];
    const parsed = { ...raw } as Record<string, unknown>;

    jsonFields.forEach((field) => {
      const value = raw[field];
      if (value !== null && value !== undefined) {
        if (typeof value === "string") {
          try {
            parsed[field] = JSON.parse(value);
          } catch (error) {
            throw new Error(
              `Invalid JSON in field '${field}': ${error instanceof Error ? error.message : "Parse error"}`
            );
          }
        } else {
          parsed[field] = value;
        }
      } else {
        parsed[field] = undefined;
      }
    });

    return parsed as TCertificatePolicy;
  };

  const create = async (data: TCertificatePolicyInsert, tx?: Knex) => {
    try {
      const serializedData = serializeJsonFields(data);
      const [certificatePolicy] = (await (tx || db)(TableName.PkiCertificatePolicy)
        .insert(serializedData as TPkiCertificatePoliciesInsert)
        .returning("*")) as Record<string, unknown>[];

      if (!certificatePolicy) {
        throw new Error("Failed to create certificate policy");
      }

      return parseJsonFields(certificatePolicy);
    } catch (error) {
      throw new DatabaseError({ error, name: "Create certificate policy" });
    }
  };

  const updateById = async (id: string, data: TCertificatePolicyUpdate, tx?: Knex) => {
    try {
      const serializedData = serializeJsonFields(data);
      const [certificatePolicy] = (await (tx || db)(TableName.PkiCertificatePolicy)
        .where({ id })
        .update(serializedData)
        .returning("*")) as Record<string, unknown>[];

      if (!certificatePolicy) {
        return null;
      }

      return parseJsonFields(certificatePolicy);
    } catch (error) {
      throw new DatabaseError({ error, name: "Update certificate policy" });
    }
  };

  const deleteById = async (id: string, tx?: Knex) => {
    try {
      const [certificatePolicy] = (await (tx || db)(TableName.PkiCertificatePolicy)
        .where({ id })
        .del()
        .returning("*")) as Record<string, unknown>[];

      return certificatePolicy;
    } catch (error) {
      throw new DatabaseError({ error, name: "Delete certificate policy" });
    }
  };

  const findById = async (id: string, tx?: Knex) => {
    try {
      const certificatePolicy = (await (tx || db)(TableName.PkiCertificatePolicy).where({ id }).first()) as
        | Record<string, unknown>
        | undefined;

      if (!certificatePolicy) {
        return null;
      }

      return parseJsonFields(certificatePolicy);
    } catch (error) {
      throw new DatabaseError({ error, name: "Find certificate policy by id" });
    }
  };

  const findByProjectId = async (
    projectId: string,
    options: {
      offset?: number;
      limit?: number;
      search?: string;
    } = {},
    processedRules?: ProcessedPermissionRules,
    tx?: Knex
  ) => {
    try {
      const { offset = 0, limit = 20, search } = options;

      let query = (tx || db)(TableName.PkiCertificatePolicy).where({ projectId });

      if (search) {
        query = query.where((builder) => {
          void builder.whereILike("name", `%${search}%`).orWhereILike("description", `%${search}%`);
        });
      }

      if (processedRules) {
        query = applyProcessedPermissionRulesToQuery(
          query,
          TableName.PkiCertificatePolicy,
          processedRules
        ) as typeof query;
      }

      const certificatePolicies = await query.orderBy("createdAt", "desc").offset(offset).limit(limit);

      return certificatePolicies.map((policy: Record<string, unknown>) => parseJsonFields(policy));
    } catch (error) {
      throw new DatabaseError({ error, name: "Find certificate policies by project id" });
    }
  };

  const countByProjectId = async (
    projectId: string,
    options: {
      search?: string;
    } = {},
    processedRules?: ProcessedPermissionRules,
    tx?: Knex
  ) => {
    try {
      const { search } = options;

      let query = (tx || db)(TableName.PkiCertificatePolicy).where({ projectId });

      if (search) {
        query = query.where((builder) => {
          void builder.whereILike("name", `%${search}%`).orWhereILike("description", `%${search}%`);
        });
      }

      if (processedRules) {
        query = applyProcessedPermissionRulesToQuery(
          query,
          TableName.PkiCertificatePolicy,
          processedRules
        ) as typeof query;
      }

      const result = await query.count("*").first();
      return parseInt((result as unknown as { count: string }).count || "0", 10);
    } catch (error) {
      throw new DatabaseError({ error, name: "Count certificate policies by project id" });
    }
  };

  const findByNameAndProjectId = async (name: string, projectId: string, tx?: Knex) => {
    try {
      const certificatePolicy = (await (tx || db)(TableName.PkiCertificatePolicy)
        .where({ name, projectId })
        .first()) as Record<string, unknown> | undefined;

      if (!certificatePolicy) {
        return null;
      }

      return parseJsonFields(certificatePolicy);
    } catch (error) {
      throw new DatabaseError({ error, name: "Find certificate policy by name and project id" });
    }
  };

  const isPolicyInUse = async (policyId: string, tx?: Knex) => {
    try {
      const profileCount = await (tx || db)(TableName.PkiCertificateProfile)
        .where({ certificatePolicyId: policyId })
        .count("*")
        .first();

      const profileUsage = parseInt((profileCount as unknown as CountResult).count || "0", 10) > 0;

      const certCount = await (tx || db)(TableName.Certificate)
        .where({ certificateTemplateId: policyId })
        .count("*")
        .first();

      const certUsage = parseInt((certCount as unknown as CountResult).count || "0", 10) > 0;

      return profileUsage || certUsage;
    } catch (error) {
      throw new DatabaseError({ error, name: "Check if certificate policy is in use" });
    }
  };

  const getProfilesUsingPolicy = async (policyId: string, tx?: Knex) => {
    try {
      const profiles = await (tx || db)(TableName.PkiCertificateProfile)
        .select("id", "slug", "description")
        .where({ certificatePolicyId: policyId });

      return profiles as Array<{ id: string; slug: string; description?: string }>;
    } catch (error) {
      throw new DatabaseError({ error, name: "Get profiles using certificate policy" });
    }
  };

  return {
    ...certificatePolicyOrm,
    create,
    updateById,
    deleteById,
    findById,
    findByProjectId,
    countByProjectId,
    findByNameAndProjectId,
    isPolicyInUse,
    getProfilesUsingPolicy
  };
};
