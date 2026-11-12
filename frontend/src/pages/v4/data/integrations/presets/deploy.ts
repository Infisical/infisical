import type { AppConnectionPreset } from "@app/components/v4/patterns/app-connection-form";
import type { AppConnection } from "@app/hooks/api/appConnections/enums";

export const DEPLOY_PRESETS: Partial<Record<AppConnection, AppConnectionPreset>> = {};
