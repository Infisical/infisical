import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { HoneyTokenType } from "@app/hooks/api/honeyTokens/enums";

export const HONEY_TOKEN_MAP: Record<
  HoneyTokenType,
  { name: string; image: string; size: number }
> = {
  [HoneyTokenType.AWS]: {
    name: "AWS",
    image: "Amazon Web Services.png",
    size: 50
  }
};

export const HONEY_TOKEN_CONNECTION_MAP: Record<HoneyTokenType, AppConnection> = {
  [HoneyTokenType.AWS]: AppConnection.AWS
};

export const HONEY_TOKEN_CREDENTIAL_FIELDS: Record<
  HoneyTokenType,
  { key: string; label: string }[]
> = {
  [HoneyTokenType.AWS]: [
    { key: "accessKeyId", label: "Access Key ID" },
    { key: "secretAccessKey", label: "Secret Access Key" }
  ]
};

export const HONEY_TOKEN_DEFAULT_SECRET_NAMES: Record<HoneyTokenType, Record<string, string>> = {
  [HoneyTokenType.AWS]: {
    accessKeyId: "AWS_ACCESS_KEY_ID",
    secretAccessKey: "AWS_SECRET_ACCESS_KEY"
  }
};
