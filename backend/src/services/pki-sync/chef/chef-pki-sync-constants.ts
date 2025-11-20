import RE2 from "re2";

export const CHEF_PKI_SYNC_CERTIFICATE_NAMING = {
  NAME_PATTERN: new RE2("^[a-zA-Z0-9_-]+$"),
  FORBIDDEN_CHARACTERS: "[]{}()<>|\\:;\"'=+*&^%$#@!~`?/",
  MIN_LENGTH: 1,
  MAX_LENGTH: 255,
  DEFAULT_SCHEMA: "{{certificateId}}"
};

export const CHEF_PKI_SYNC_DATA_BAG_NAMING = {
  NAME_PATTERN: new RE2("^[a-zA-Z0-9_-]+$"),
  FORBIDDEN_CHARACTERS: "[]{}()<>|\\:;\"'=+*&^%$#@!~`?/.",
  MIN_LENGTH: 1,
  MAX_LENGTH: 255
};

export const CHEF_PKI_SYNC_DEFAULTS = {
  CERTIFICATE_DATA_BAG: "ssl_certificates",
  ITEM_NAME_TEMPLATE: "{{certificateId}}",
  INFISICAL_PREFIX: "Infisical-",
  DEFAULT_ENVIRONMENT: "global"
} as const;
