import { NhiIdentityType, NhiProvider } from "./nhi-enums";

export type TRawNhiIdentity = {
  externalId: string;
  name: string;
  type: NhiIdentityType;
  provider: NhiProvider;
  metadata: Record<string, unknown>;
  policies: string[];
  keyCreateDate?: Date | null;
  keyLastUsedDate?: Date | null;
  lastActivityAt?: Date | null;
};
