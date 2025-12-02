import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName, TCertificateRequests, TCertificates } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify, selectAllTableCols } from "@app/lib/knex";

type TCertificateRequestWithCertificate = TCertificateRequests & {
  certificate: TCertificates | null;
};

export type TCertificateRequestDALFactory = ReturnType<typeof certificateRequestDALFactory>;

export const certificateRequestDALFactory = (db: TDbClient) => {
  const certificateRequestOrm = ormify(db, TableName.CertificateRequests);

  const findByIdWithCertificate = async (id: string): Promise<TCertificateRequestWithCertificate | null> => {
    try {
      const certificateRequest = await certificateRequestOrm.findById(id);
      if (!certificateRequest) return null;

      if (!certificateRequest.certificateId) {
        return {
          ...certificateRequest,
          certificate: null
        };
      }

      const certificate = await db(TableName.Certificate)
        .where("id", certificateRequest.certificateId)
        .select(selectAllTableCols(TableName.Certificate))
        .first();

      return {
        ...certificateRequest,
        certificate: certificate || null
      };
    } catch (error) {
      throw new DatabaseError({ error, name: "Find certificate request by ID with certificate" });
    }
  };

  const findPendingByProjectId = async (projectId: string): Promise<TCertificateRequests[]> => {
    try {
      return (await db(TableName.CertificateRequests)
        .where({ projectId, status: "pending" })
        .orderBy("createdAt", "desc")) as TCertificateRequests[];
    } catch (error) {
      throw new DatabaseError({ error, name: "Find pending certificate requests by project ID" });
    }
  };

  const updateStatus = async (
    id: string,
    status: string,
    errorMessage?: string,
    tx?: Knex
  ): Promise<TCertificateRequests> => {
    try {
      const updateData: Partial<TCertificateRequests> = { status };
      if (errorMessage !== undefined) {
        updateData.errorMessage = errorMessage;
      }
      return await certificateRequestOrm.updateById(id, updateData, tx);
    } catch (error) {
      throw new DatabaseError({ error, name: "Update certificate request status" });
    }
  };

  const attachCertificate = async (id: string, certificateId: string, tx?: Knex): Promise<TCertificateRequests> => {
    try {
      return await certificateRequestOrm.updateById(
        id,
        {
          certificateId,
          status: "issued"
        },
        tx
      );
    } catch (error) {
      throw new DatabaseError({ error, name: "Attach certificate to request" });
    }
  };

  return {
    ...certificateRequestOrm,
    findByIdWithCertificate,
    findPendingByProjectId,
    updateStatus,
    attachCertificate
  };
};
