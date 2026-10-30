export const SERVICENOW_ACCESS_REQUEST_PATH = "/api/x_infis_approvals/v1/infisical/access_request";

export const SERVICENOW_DISPATCH_TIMEOUT_MS = 15_000;

export const SERVICENOW_DISPATCH_MAX_CONTENT_LENGTH = 64 * 1024;

export const SERVICENOW_ERROR_DETAIL_MAX_CHARS = 200;

// The permissions column of the Infisical Approvals ServiceNow application truncates silently past this.
export const SERVICENOW_PERMISSIONS_MAX_CHARS = 4_000;
