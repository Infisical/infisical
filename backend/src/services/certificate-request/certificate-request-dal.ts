import { TDbClient } from "@app/db";
import { TableName, TCertificateRequests } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify } from "@app/lib/knex";

type TCertificateRequestWithCertificateFlat = TCertificateRequests & {
  certificateId?: string | null;
  certificateSerialNumber?: string | null;
  certificateFriendlyName?: string | null;
  certificateCommonName?: string | null;
  certificateAltNames?: string | null;
  certificateStatus?: string | null;
  certificateNotBefore?: Date | null;
  certificateNotAfter?: Date | null;
  certificateKeyUsages?: string[] | null;
  certificateExtendedKeyUsages?: string[] | null;
};

type TCertificateInfo = {
  id: string;
  serialNumber: string;
  friendlyName: string | null;
  commonName: string;
  altNames: string | null;
  status: string;
  notBefore: Date;
  notAfter: Date;
  keyUsages: string[] | null;
  extendedKeyUsages: string[] | null;
};

type TCertificateRequestWithCertificate = TCertificateRequests & {
  certificate: TCertificateInfo | null;
};

export type TCertificateRequestDALFactory = ReturnType<typeof certificateRequestDALFactory>;

export const certificateRequestDALFactory = (db: TDbClient) => {
  const certificateRequestOrm = ormify(db, TableName.CertificateRequests);

  const findByIdWithCertificate = async (id: string): Promise<TCertificateRequestWithCertificate | null> => {
    try {
      const certificateRequest = (await db(TableName.CertificateRequests)
        .leftJoin(
          TableName.Certificate,
          `${TableName.CertificateRequests}.certificateId`,
          `${TableName.Certificate}.id`
        )
        .where(`${TableName.CertificateRequests}.id`, id)
        .select(
          `${TableName.CertificateRequests}.*`,
          `${TableName.Certificate}.id as certificateId`,
          `${TableName.Certificate}.serialNumber as certificateSerialNumber`,
          `${TableName.Certificate}.friendlyName as certificateFriendlyName`,
          `${TableName.Certificate}.commonName as certificateCommonName`,
          `${TableName.Certificate}.altNames as certificateAltNames`,
          `${TableName.Certificate}.status as certificateStatus`,
          `${TableName.Certificate}.notBefore as certificateNotBefore`,
          `${TableName.Certificate}.notAfter as certificateNotAfter`,
          `${TableName.Certificate}.keyUsages as certificateKeyUsages`,
          `${TableName.Certificate}.extendedKeyUsages as certificateExtendedKeyUsages`
        )
        .first()) as TCertificateRequestWithCertificateFlat | undefined;

      if (!certificateRequest) return null;

      // Transform the flat result into nested structure
      const {
        certificateId,
        certificateSerialNumber,
        certificateFriendlyName,
        certificateCommonName,
        certificateAltNames,
        certificateStatus,
        certificateNotBefore,
        certificateNotAfter,
        certificateKeyUsages,
        certificateExtendedKeyUsages,
        ...certificateRequestData
      } = certificateRequest;

      return {
        ...certificateRequestData,
        certificate: certificateId
          ? {
              id: certificateId,
              serialNumber: certificateSerialNumber as string,
              friendlyName: certificateFriendlyName || null,
              commonName: certificateCommonName as string,
              altNames: certificateAltNames || null,
              status: certificateStatus as string,
              notBefore: certificateNotBefore as Date,
              notAfter: certificateNotAfter as Date,
              keyUsages: certificateKeyUsages || null,
              extendedKeyUsages: certificateExtendedKeyUsages || null
            }
          : null
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

  const updateStatus = async (id: string, status: string, errorMessage?: string): Promise<TCertificateRequests> => {
    try {
      const updateData: Partial<TCertificateRequests> = { status };
      if (errorMessage !== undefined) {
        updateData.errorMessage = errorMessage;
      }
      return await certificateRequestOrm.updateById(id, updateData);
    } catch (error) {
      throw new DatabaseError({ error, name: "Update certificate request status" });
    }
  };

  const attachCertificate = async (id: string, certificateId: string): Promise<TCertificateRequests> => {
    try {
      return await certificateRequestOrm.updateById(id, {
        certificateId,
        status: "issued"
      });
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
