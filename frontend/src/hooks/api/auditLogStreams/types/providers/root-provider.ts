import { AuditLogStreamProduct, StreamMode } from "../../enums";

export type TAuditLogStreamFilters = {
  products?: AuditLogStreamProduct[] | null;
};

export type TRootProviderLogStream = {
  id: string;
  orgId: string;
  createdAt: string;
  updatedAt: string;
  streamMode: StreamMode;
  filters?: TAuditLogStreamFilters | null;
};
