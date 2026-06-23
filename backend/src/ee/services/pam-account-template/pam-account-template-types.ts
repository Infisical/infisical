import { PamAccountType } from "../pam/pam-enums";
import { TPamTemplateSettings } from "./pam-account-template-schemas";

export type TCreatePamAccountTemplateDTO = {
  projectId: string;
  name: string;
  description?: string;
  type: PamAccountType;
  policies?: Record<string, unknown>;
  settings?: TPamTemplateSettings;
  gatewayId?: string;
  gatewayPoolId?: string;
  recordingConnectionId?: string;
};

export type TUpdatePamAccountTemplateDTO = {
  templateId: string;
  projectId: string;
  name?: string;
  description?: string | null;
  policies?: Record<string, unknown>;
  settings?: TPamTemplateSettings;
  gatewayId?: string | null;
  gatewayPoolId?: string | null;
  recordingConnectionId?: string | null;
};

export type TDeletePamAccountTemplateDTO = {
  templateId: string;
  projectId: string;
};

export type TGetPamAccountTemplateDTO = {
  templateId: string;
  projectId: string;
};

export type TListPamAccountTemplatesDTO = {
  projectId: string;
  search?: string;
  type?: PamAccountType;
};
