import { PamAccountType } from "../pam/pam-enums";

export type TCreatePamAccountDTO = {
  projectId: string;
  accountType: PamAccountType;
  name: string;
  description?: string;
  folderId: string;
  templateId: string;
  connectionDetails: Record<string, unknown>;
  credentials: Record<string, unknown>;
  gatewayId?: string;
  gatewayPoolId?: string;
  recordingConnectionId?: string;
  recordingSettings?: { s3Config?: { bucket: string; region: string; keyPrefix?: string } } | null;
};

export type TUpdatePamAccountDTO = {
  accountId: string;
  projectId: string;
  accountType: PamAccountType;
  name?: string;
  description?: string | null;
  folderId?: string;
  templateId?: string;
  connectionDetails?: Record<string, unknown>;
  credentials?: Record<string, unknown>;
  gatewayId?: string | null;
  gatewayPoolId?: string | null;
  recordingConnectionId?: string | null;
  recordingSettings?: { s3Config?: { bucket: string; region: string; keyPrefix?: string } } | null;
};

export type TDeletePamAccountDTO = {
  accountId: string;
  projectId: string;
};

export type TGetPamAccountDTO = {
  accountId: string;
  projectId: string;
};

export type TListPamAccountsDTO = {
  projectId: string;
  folderId?: string;
  templateId?: string;
  search?: string;
};

export type TListAccessibleAccountsDTO = {
  projectId: string;
  search?: string;
  folderId?: string;
  accountType?: string;
};
