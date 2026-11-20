import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName, TPkiMicrosoftAutoenrollmentRequestsInsert } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";

export type TMicrosoftAutoenrollmentRequestDALFactory = ReturnType<typeof microsoftAutoenrollmentRequestDALFactory>;

export const microsoftAutoenrollmentRequestDALFactory = (db: TDbClient) => {
  const createRequestNumber = async (certificateRequest: { id: string; createdAt: Date }, tx: Knex) => {
    try {
      const [created] = await tx(TableName.PkiMicrosoftAutoenrollmentRequest)
        .insert({
          certificateRequestId: certificateRequest.id,
          certificateRequestCreatedAt: certificateRequest.createdAt
        } as TPkiMicrosoftAutoenrollmentRequestsInsert)
        .returning("requestNumber");
      return created.requestNumber;
    } catch (error) {
      throw new DatabaseError({ error, name: "Create Microsoft Autoenrollment request number" });
    }
  };

  const findCertificateRequestIdByRequestNumber = async (requestNumber: number) => {
    try {
      const row = await db(TableName.PkiMicrosoftAutoenrollmentRequest)
        .where({ requestNumber })
        .first("certificateRequestId");
      return row?.certificateRequestId;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find Microsoft Autoenrollment request by number" });
    }
  };

  return { createRequestNumber, findCertificateRequestIdByRequestNumber };
};
