import { PamAccountType } from "../pam/pam-enums";
import { TPamTemplateAccessPolicy, TPamTemplateSettings } from "../pam/pam-template-config-schemas";

export type TCreatePamAccountTemplateDTO = {
  projectId: string;
  name: string;
  description?: string;
  type: PamAccountType;
  accessPolicy?: TPamTemplateAccessPolicy;
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
  accessPolicy?: TPamTemplateAccessPolicy;
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
