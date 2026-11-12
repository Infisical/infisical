import type { AppConnectionPreset } from "@app/components/v4/patterns/app-connection-form";
import type { AppConnection } from "@app/hooks/api/appConnections/enums";

import { CLOUD_PRESETS } from "./presets/cloud";
import { CORE_PRESETS } from "./presets/core";
import { DATABASE_PRESETS } from "./presets/databases";
import { DEPLOY_PRESETS } from "./presets/deploy";
import { INFRASTRUCTURE_PRESETS } from "./presets/infrastructure";
import { SERVICE_PRESETS } from "./presets/services";

export const CONNECTION_PRESETS: Partial<Record<AppConnection, AppConnectionPreset>> = {
  ...CORE_PRESETS,
  ...CLOUD_PRESETS,
  ...DATABASE_PRESETS,
  ...INFRASTRUCTURE_PRESETS,
  ...DEPLOY_PRESETS,
  ...SERVICE_PRESETS
};
