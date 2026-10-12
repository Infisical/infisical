import RE2 from "re2";

export const GCP_PROJECT_ID_PATTERN = new RE2("^[a-z][a-z0-9-]{4,28}[a-z0-9]$");

export const GCP_CLOUD_DNS_ZONE_RESOURCE_PATTERN = new RE2(
  "^projects/[a-z][a-z0-9-]{4,28}[a-z0-9]/managedZones/[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$"
);

export const GCP_GLOBAL_LOCATION = "global";
