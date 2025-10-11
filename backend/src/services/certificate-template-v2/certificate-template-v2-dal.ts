import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { TCertificateTemplatesV2Insert } from "@app/db/schemas/certificate-templates-v2";
import { DatabaseError } from "@app/lib/errors";
import { ormify } from "@app/lib/knex";

import {
  TCertificateTemplateV2,
  TCertificateTemplateV2Insert,
  TCertificateTemplateV2Update
} from "./certificate-template-v2-types";

export type TCertificateTemplateV2DALFactory = ReturnType<typeof certificateTemplateV2DALFactory>;

export const certificateTemplateV2DALFactory = (db: TDbClient) => {
  const certificateTemplateV2Orm = ormify(db, TableName.CertificateTemplateV2);

  const serializeJsonFields = (data: TCertificateTemplateV2Insert | TCertificateTemplateV2Update) => {
    const serialized = { ...data } as Record<string, unknown>;
    const jsonFields = [
      "attributes",
      "keyUsages",
      "extendedKeyUsages",
      "subjectAlternativeNames",
      "validity",
      "signatureAlgorithm",
      "keyAlgorithm"
    ];

    jsonFields.forEach((field) => {
      const value = (data as Record<string, unknown>)[field];
      if (value !== undefined) {
        serialized[field] = JSON.stringify(value);
      }
    });

    return serialized;
  };

  const parseJsonFields = (raw: Record<string, unknown>): TCertificateTemplateV2 => {
    const jsonFields = [
      "attributes",
      "keyUsages",
      "extendedKeyUsages",
      "subjectAlternativeNames",
      "validity",
      "signatureAlgorithm",
      "keyAlgorithm"
    ];
    const parsed = { ...raw };

    jsonFields.forEach((field) => {
      const value = raw[field];
      if (value) {
        parsed[field] = typeof value === "string" ? JSON.parse(value) : value;
      }
    });

    return parsed as TCertificateTemplateV2;
  };

  const create = async (data: TCertificateTemplateV2Insert, tx?: Knex) => {
    try {
      const serializedData = serializeJsonFields(data);
      const [certificateTemplateV2] = await (tx || db)(TableName.CertificateTemplateV2)
        .insert(serializedData as TCertificateTemplatesV2Insert)
        .returning("*");

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
      const [certificateTemplateV2] = await (tx || db)(TableName.CertificateTemplateV2)
        .where({ id })
        .update(serializedData)
        .returning("*");

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
      const [certificateTemplateV2] = await (tx || db)(TableName.CertificateTemplateV2)
        .where({ id })
        .del()
        .returning("*");

      return certificateTemplateV2;
    } catch (error) {
      throw new DatabaseError({ error, name: "Delete certificate template v2" });
    }
  };

  const findById = async (id: string, tx?: Knex) => {
    try {
      const certificateTemplateV2 = await (tx || db)(TableName.CertificateTemplateV2).where({ id }).first();

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
    tx?: Knex
  ) => {
    try {
      const { offset = 0, limit = 20, search } = options;

      let query = (tx || db)(TableName.CertificateTemplateV2).where({ projectId });

      if (search) {
        query = query.where((builder) => {
          void builder.whereILike("slug", `%${search}%`).orWhereILike("description", `%${search}%`);
        });
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
    tx?: Knex
  ) => {
    try {
      const { search } = options;

      let query = (tx || db)(TableName.CertificateTemplateV2).where({ projectId });

      if (search) {
        query = query.where((builder) => {
          void builder.whereILike("slug", `%${search}%`).orWhereILike("description", `%${search}%`);
        });
      }

      const result = await query.count("*").first();
      return parseInt((result as unknown as { count: string }).count || "0", 10);
    } catch (error) {
      throw new DatabaseError({ error, name: "Count certificate templates v2 by project id" });
    }
  };

  const findBySlugAndProjectId = async (slug: string, projectId: string, tx?: Knex) => {
    try {
      const certificateTemplateV2 = await (tx || db)(TableName.CertificateTemplateV2)
        .where({ slug, projectId })
        .first();

      if (!certificateTemplateV2) {
        return null;
      }

      return parseJsonFields(certificateTemplateV2);
    } catch (error) {
      throw new DatabaseError({ error, name: "Find certificate template v2 by slug and project id" });
    }
  };

  const isTemplateInUse = async (templateId: string, tx?: Knex) => {
    try {
      const profileCount = await (tx || db)(TableName.CertificateProfile)
        .where({ certificateTemplateId: templateId })
        .count("*")
        .first();

      return parseInt(profileCount || "0", 10) > 0;
    } catch (error) {
      throw new DatabaseError({ error, name: "Check if certificate template v2 is in use" });
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
    findBySlugAndProjectId,
    isTemplateInUse
  };
};
