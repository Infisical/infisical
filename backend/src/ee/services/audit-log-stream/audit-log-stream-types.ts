import { TAuditLogStreams } from "@app/db/schemas";
import { TOrgPermission } from "@app/lib/types";

export type LogStreamHeaders = {
  key: string;
  value: string;
};

export type TCreateAuditLogStreamDTO = Omit<TOrgPermission, "orgId"> & {
  url: string;
  headers?: LogStreamHeaders[];
};

export type TUpdateAuditLogStreamDTO = Omit<TOrgPermission, "orgId"> & {
  id: string;
  url?: string;
  headers?: LogStreamHeaders[];
};

export type TDeleteAuditLogStreamDTO = Omit<TOrgPermission, "orgId"> & {
  id: string;
};

export type TListAuditLogStreamDTO = Omit<TOrgPermission, "orgId">;

export type TGetDetailsAuditLogStreamDTO = Omit<TOrgPermission, "orgId"> & {
  id: string;
};

export type TAuditLogStreamServiceFactory = {
  create: (arg: TCreateAuditLogStreamDTO) => Promise<TAuditLogStreams>;
  updateById: (arg: TUpdateAuditLogStreamDTO) => Promise<TAuditLogStreams>;
  deleteById: (arg: TDeleteAuditLogStreamDTO) => Promise<TAuditLogStreams>;
  getById: (arg: TGetDetailsAuditLogStreamDTO) => Promise<{
    headers: LogStreamHeaders[] | undefined;
    orgId: string;
    url: string;
    id: string;
    createdAt: Date;
    updatedAt: Date;
    encryptedHeadersCiphertext?: string | null | undefined;
    encryptedHeadersIV?: string | null | undefined;
    encryptedHeadersTag?: string | null | undefined;
    encryptedHeadersAlgorithm?: string | null | undefined;
    encryptedHeadersKeyEncoding?: string | null | undefined;
  }>;
  list: (arg: TListAuditLogStreamDTO) => Promise<TAuditLogStreams[]>;
};
