import { AppConnection } from "@app/hooks/api/appConnections/enums";

export const UNCHANGED_PASSWORD_SENTINEL = "__INFISICAL_UNCHANGED__";

export const PAM_RECORDING_CONNECTION_APPS = [AppConnection.AWS, AppConnection.S3Compatible];
