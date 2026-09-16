// Every error raised from a license-server interaction is formatted through here, so one grep on
// licenseRequestId ties a failure in our logs to the exact request in the license server's. The id
// falls back to "unknown" rather than being omitted, so the field is always there to match on.
const LICENSE_REQUEST_ID_HEADER = "x-request-id";

// Carried as the thrown error's name instead of the default "BadRequest"/"InternalServerError", so a
// failure that originated at the license server is attributable without matching on message text (the
// error handler logs error.name and labels the error metrics with it).
export const LICENSE_SERVER_ERROR_NAME = "LicenseServerError";

export const readLicenseRequestId = (res: Response): string => res.headers.get(LICENSE_REQUEST_ID_HEADER) ?? "unknown";

export const licenseErrorMessage = (requestId: string, message: string): string =>
  `license-client: [licenseRequestId=${requestId}] ${message}`;
