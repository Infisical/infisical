import RE2 from "re2";

export const GCP_PROJECT_ID_PATTERN = new RE2("^[a-z][a-z0-9-]{4,28}[a-z0-9]$");

export const GCP_CLOUD_DNS_ZONE_RESOURCE_PATTERN = new RE2(
  "^projects/[a-z][a-z0-9-]{4,28}[a-z0-9]/managedZones/[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$"
);

export const GCP_GLOBAL_LOCATION = "global";

export const GCP_WORKLOAD_IDENTITY_PROVIDER_PATTERN = new RE2(
  "^projects/[0-9]{1,20}/locations/global/workloadIdentityPools/[a-z0-9-]{4,32}/providers/[a-z0-9-]{4,32}$"
);

export const GCP_STS_TOKEN_URL = "https://sts.googleapis.com/v1/token";
export const GCP_IAM_CREDENTIALS_URL = "https://iamcredentials.googleapis.com";
