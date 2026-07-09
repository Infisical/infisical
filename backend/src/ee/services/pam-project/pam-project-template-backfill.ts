import { PamAccountType } from "../pam/pam-enums";
import { TPamTemplateSettings } from "../pam-account-template/pam-account-template-schemas";
import { PamRecordingStorageBackend } from "../pam-session-recording/pam-recording-enums";

export const WEB_RESOURCE_DEFAULT_TEMPLATE = {
  name: "web-resource",
  type: PamAccountType.WebResource,
  settings: {
    recordingEnabled: true,
    recordingStorageBackend: PamRecordingStorageBackend.Postgres
  } satisfies TPamTemplateSettings
};

export const buildWebResourceTemplateBackfillRows = (projectIds: string[]) =>
  projectIds.map((projectId) => ({
    projectId,
    name: WEB_RESOURCE_DEFAULT_TEMPLATE.name,
    type: WEB_RESOURCE_DEFAULT_TEMPLATE.type,
    settings: WEB_RESOURCE_DEFAULT_TEMPLATE.settings
  }));
