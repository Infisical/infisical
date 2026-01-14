import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { TPkiCertificateTemplatesV2Insert } from "@app/db/schemas/pki-certificate-templates-v2";
import { DatabaseError } from "@app/lib/errors";
import { ormify } from "@app/lib/knex";
import {
  applyProcessedPermissionRulesToQuery,
  type ProcessedPermissionRules
} from "@app/lib/knex/permission-filter-utils";

import {
  TCertificateTemplateV2,
  TCertificateTemplateV2Insert,
  TCertificateTemplateV2Update
} from "./certificate-template-v2-types";

export type TCertificateTemplateV2DALFactory = ReturnType<typeof certificateTemplateV2DALFactory>;

interface CountResult {
  count: string;
}

export const certificateTemplateV2DALFactory = (db: TDbClient) => {
  const certificateTemplateV2Orm = ormify(db, TableName.PkiCertificateTemplateV2);

  const serializeJsonFields = (data: TCertificateTemplateV2Insert | TCertificateTemplateV2Update) => {
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

  const parseJsonFields = (raw: Record<string, unknown>): TCertificateTemplateV2 => {
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

    return parsed as TCertificateTemplateV2;
  };

  const create = async (data: TCertificateTemplateV2Insert, tx?: Knex) => {
    try {
      const serializedData = serializeJsonFields(data);
      const [certificateTemplateV2] = (await (tx || db)(TableName.PkiCertificateTemplateV2)
        .insert(serializedData as TPkiCertificateTemplatesV2Insert)
        .returning("*")) as Record<string, unknown>[];

      if (!certificateTemplateV2) {
        throw new Error("Failed to create certificate template v2");
      }

      return parseJsonFields(certificateTemplateV2);
    } catch (error) {
      throw new DatabaseError({ error, name: "Create certificate template v2" });
    }
  };

  const updateById = async (id: string, data: TCertificateTemplateV2Update, tx?: Knex) => {
    try {
      const serializedData = serializeJsonFields(data);
      const [certificateTemplateV2] = (await (tx || db)(TableName.PkiCertificateTemplateV2)
        .where({ id })
        .update(serializedData)
        .returning("*")) as Record<string, unknown>[];

      if (!certificateTemplateV2) {
        return null;
      }

      return parseJsonFields(certificateTemplateV2);
    } catch (error) {
      throw new DatabaseError({ error, name: "Update certificate template v2" });
    }
  };

  const deleteById = async (id: string, tx?: Knex) => {
    try {
      const [certificateTemplateV2] = (await (tx || db)(TableName.PkiCertificateTemplateV2)
        .where({ id })
        .del()
        .returning("*")) as Record<string, unknown>[];

      return certificateTemplateV2;
    } catch (error) {
      throw new DatabaseError({ error, name: "Delete certificate template v2" });
    }
  };

  const findById = async (id: string, tx?: Knex) => {
    try {
      const certificateTemplateV2 = (await (tx || db)(TableName.PkiCertificateTemplateV2).where({ id }).first()) as
        | Record<string, unknown>
        | undefined;

      if (!certificateTemplateV2) {
        return null;
      }

      return parseJsonFields(certificateTemplateV2);
    } catch (error) {
      throw new DatabaseError({ error, name: "Find certificate template v2 by id" });
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

      let query = (tx || db)(TableName.PkiCertificateTemplateV2).where({ projectId });

      if (search) {
        query = query.where((builder) => {
          void builder.whereILike("name", `%${search}%`).orWhereILike("description", `%${search}%`);
        });
      }

      if (processedRules) {
        query = applyProcessedPermissionRulesToQuery(
          query,
          TableName.PkiCertificateTemplateV2,
          processedRules
        ) as typeof query;
      }

      const certificateTemplatesV2 = await query.orderBy("createdAt", "desc").offset(offset).limit(limit);

      return certificateTemplatesV2.map((template: Record<string, unknown>) => parseJsonFields(template));
    } catch (error) {
      throw new DatabaseError({ error, name: "Find certificate templates v2 by project id" });
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

      let query = (tx || db)(TableName.PkiCertificateTemplateV2).where({ projectId });

      if (search) {
        query = query.where((builder) => {
          void builder.whereILike("name", `%${search}%`).orWhereILike("description", `%${search}%`);
        });
      }

      if (processedRules) {
        query = applyProcessedPermissionRulesToQuery(
          query,
          TableName.PkiCertificateTemplateV2,
          processedRules
        ) as typeof query;
      }

      const result = await query.count("*").first();
      return parseInt((result as unknown as { count: string }).count || "0", 10);
    } catch (error) {
      throw new DatabaseError({ error, name: "Count certificate templates v2 by project id" });
    }
  };

  const findByNameAndProjectId = async (name: string, projectId: string, tx?: Knex) => {
    try {
      const certificateTemplateV2 = (await (tx || db)(TableName.PkiCertificateTemplateV2)
        .where({ name, projectId })
        .first()) as Record<string, unknown> | undefined;

      if (!certificateTemplateV2) {
        return null;
      }

      return parseJsonFields(certificateTemplateV2);
    } catch (error) {
      throw new DatabaseError({ error, name: "Find certificate template v2 by name and project id" });
    }
  };

  const isTemplateInUse = async (templateId: string, tx?: Knex) => {
    try {
      const profileCount = await (tx || db)(TableName.PkiCertificateProfile)
        .where({ certificateTemplateId: templateId })
        .count("*")
        .first();

      const profileUsage = parseInt((profileCount as unknown as CountResult).count || "0", 10) > 0;

      const certCount = await (tx || db)(TableName.Certificate)
        .where({ certificateTemplateId: templateId })
        .count("*")
        .first();

      const certUsage = parseInt((certCount as unknown as CountResult).count || "0", 10) > 0;

      return profileUsage || certUsage;
    } catch (error) {
      throw new DatabaseError({ error, name: "Check if certificate template v2 is in use" });
    }
  };

  const getProfilesUsingTemplate = async (templateId: string, tx?: Knex) => {
    try {
      const profiles = await (tx || db)(TableName.PkiCertificateProfile)
        .select("id", "slug", "description")
        .where({ certificateTemplateId: templateId });

      return profiles as Array<{ id: string; slug: string; description?: string }>;
    } catch (error) {
      throw new DatabaseError({ error, name: "Get profiles using certificate template v2" });
    }
  };

  return {
    ...certificateTemplateV2Orm,
    create,
    updateById,
    deleteById,
    findById,
    findByProjectId,
    countByProjectId,
    findByNameAndProjectId,
    isTemplateInUse,
    getProfilesUsingTemplate
  };
};
