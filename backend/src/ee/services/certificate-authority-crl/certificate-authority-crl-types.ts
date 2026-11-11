import { AuditLogInfo } from "@app/ee/services/audit-log/audit-log-types";
import { TProjectPermission } from "@app/lib/types";

export type TGetCrlById = string;

export type TGetCaCrlsDTO = {
  caId: string;
} & Omit<TProjectPermission, "projectId">;

export type TRegenerateCrlDTO = {
  caId: string;
  auditLogInfo: AuditLogInfo;
} & Omit<TProjectPermission, "projectId">;

type TCaCrlDetails = {
  id: string;
  thisUpdate: Date;
  nextUpdate: Date;
  crl: string;
};

export type TCertificateAuthorityCrlServiceFactory = {
  getCrlById: (crlId: TGetCrlById) => Promise<{
    ca: {
      readonly requireTemplateForIssuance: boolean;
      readonly internalCa:
        | {
            id: string;
            parentCaId: string | null | undefined;
            type: string;
            friendlyName: string;
            organization: string;
            ou: string;
            country: string;
            province: string;
            locality: string;
            commonName: string;
            dn: string;
            serialNumber: string | null | undefined;
            maxPathLength: number | null | undefined;
            keyAlgorithm: string;
            notBefore: string | undefined;
            notAfter: string | undefined;
            activeCaCertId: string | null | undefined;
          }
        | undefined;
      readonly externalCa:
        | {
            id: string;
            type: string;
            configuration: unknown;
            dnsAppConnectionId: string | null | undefined;
            appConnectionId: string | null | undefined;
            credentials: Buffer | null | undefined;
          }
        | undefined;
      readonly name: string;
      readonly status: string;
      readonly id: string;
      readonly createdAt: Date;
      readonly updatedAt: Date;
      readonly projectId: string;
      readonly enableDirectIssuance: boolean;
      readonly parentCaId: string | null | undefined;
      readonly type: string;
      readonly friendlyName: string;
      readonly organization: string;
      readonly ou: string;
      readonly country: string;
      readonly province: string;
      readonly locality: string;
      readonly commonName: string;
      readonly dn: string;
      readonly serialNumber: string | null | undefined;
      readonly maxPathLength: number | null | undefined;
      readonly keyAlgorithm: string;
      readonly notBefore: string | undefined;
      readonly notAfter: string | undefined;
      readonly activeCaCertId: string | null | undefined;
    };
    caCrl: {
      id: string;
      createdAt: Date;
      updatedAt: Date;
      caId: string;
      caSecretId: string;
      encryptedCrl: Buffer;
    };
    crl: ArrayBuffer;
  }>;
  getCaCrls: ({ caId, actorId, actorAuthMethod, actor, actorOrgId }: TGetCaCrlsDTO) => Promise<{
    ca: {
      readonly requireTemplateForIssuance: boolean;
      readonly internalCa:
        | {
            id: string;
            parentCaId: string | null | undefined;
            type: string;
            friendlyName: string;
            organization: string;
            ou: string;
            country: string;
            province: string;
            locality: string;
            commonName: string;
            dn: string;
            serialNumber: string | null | undefined;
            maxPathLength: number | null | undefined;
            keyAlgorithm: string;
            notBefore: string | undefined;
            notAfter: string | undefined;
            activeCaCertId: string | null | undefined;
          }
        | undefined;
      readonly externalCa:
        | {
            id: string;
            type: string;
            configuration: unknown;
            dnsAppConnectionId: string | null | undefined;
            appConnectionId: string | null | undefined;
            credentials: Buffer | null | undefined;
          }
        | undefined;
      readonly name: string;
      readonly status: string;
      readonly id: string;
      readonly createdAt: Date;
      readonly updatedAt: Date;
      readonly projectId: string;
      readonly enableDirectIssuance: boolean;
      readonly parentCaId: string | null | undefined;
      readonly type: string;
      readonly friendlyName: string;
      readonly organization: string;
      readonly ou: string;
      readonly country: string;
      readonly province: string;
      readonly locality: string;
      readonly commonName: string;
      readonly dn: string;
      readonly serialNumber: string | null | undefined;
      readonly maxPathLength: number | null | undefined;
      readonly keyAlgorithm: string;
      readonly notBefore: string | undefined;
      readonly notAfter: string | undefined;
      readonly activeCaCertId: string | null | undefined;
    };
    crls: (TCaCrlDetails & { crlNumber: number | null })[];
  }>;
  regenerateCrl: (dto: TRegenerateCrlDTO) => Promise<{
    crl: TCaCrlDetails & { crlNumber: number };
  }>;
};
