import { AxiosError, AxiosHeaders } from "axios";

import {
  getGcpErrorStatus,
  getGcpHttpStatus,
  isCertificateInUseError,
  mapGcpError
} from "./gcp-certificate-manager-pki-sync-client";
import {
  gcpCertificateMapEntryPermission,
  gcpCertificateMapPermission,
  gcpCertificatePermission
} from "./gcp-certificate-manager-pki-sync-constants";
import { GcpCertificateManagerAction } from "./gcp-certificate-manager-pki-sync-enums";

const googleError = (httpStatus: number, status: string, message: string) => {
  const error = new AxiosError(message);
  error.response = {
    status: httpStatus,
    statusText: status,
    headers: new AxiosHeaders(),
    config: { headers: new AxiosHeaders() },
    data: { error: { code: httpStatus, status, message } }
  };
  return error;
};

const context = { operation: "certificate upload", gcpProjectId: "my-prod-project" };

describe("mapGcpError", () => {
  test("names the missing permission and does not retry", () => {
    const mapped = mapGcpError(googleError(403, "PERMISSION_DENIED", "caller lacks permission"), {
      ...context,
      permission: gcpCertificatePermission(GcpCertificateManagerAction.Create)
    });

    expect(mapped.shouldRetry).toBe(false);
    expect(mapped.message).toContain("certificatemanager.certs.create");
    expect(mapped.message).toContain("my-prod-project");
    expect(mapped.message).toContain("roles/certificatemanager.editor");
  });

  test("uses the permission IDs GCP actually publishes", () => {
    expect(gcpCertificatePermission(GcpCertificateManagerAction.Delete)).toBe("certificatemanager.certs.delete");
    expect(gcpCertificateMapPermission(GcpCertificateManagerAction.Get)).toBe("certificatemanager.certmaps.get");
    expect(gcpCertificateMapEntryPermission(GcpCertificateManagerAction.Create)).toBe(
      "certificatemanager.certmapentries.create"
    );
  });

  test("asks for the owner role when the denied permission is a delete", () => {
    const denied = (permission: string) =>
      mapGcpError(googleError(403, "PERMISSION_DENIED", "caller lacks permission"), { ...context, permission }).message;

    expect(denied(gcpCertificatePermission(GcpCertificateManagerAction.Delete))).toContain(
      "roles/certificatemanager.owner"
    );
    expect(denied(gcpCertificateMapEntryPermission(GcpCertificateManagerAction.Delete))).toContain(
      "roles/certificatemanager.owner"
    );
    expect(denied(gcpCertificateMapEntryPermission(GcpCertificateManagerAction.Update))).toContain(
      "roles/certificatemanager.editor"
    );
  });

  test("detects a disabled Certificate Manager API", () => {
    const mapped = mapGcpError(
      googleError(
        403,
        "PERMISSION_DENIED",
        "Certificate Manager API has not been used in project 12345 before or it is disabled"
      ),
      context
    );

    expect(mapped.shouldRetry).toBe(false);
    expect(mapped.message).toContain("certificatemanager.googleapis.com");
  });

  test("keeps rate limits retryable", () => {
    const mapped = mapGcpError(googleError(429, "RESOURCE_EXHAUSTED", "quota exceeded"), context);
    expect(mapped.shouldRetry).toBe(true);
  });

  test("passes through Google's message for invalid arguments and does not retry", () => {
    const mapped = mapGcpError(googleError(400, "INVALID_ARGUMENT", "pem_certificate is malformed"), {
      ...context,
      resource: 'certificate "infisical-abc"'
    });

    expect(mapped.shouldRetry).toBe(false);
    expect(mapped.message).toContain("pem_certificate is malformed");
    expect(mapped.message).toContain('certificate "infisical-abc"');
  });

  test("tells the user which knobs to check on a 404", () => {
    const mapped = mapGcpError(googleError(404, "NOT_FOUND", "not found"), context);
    expect(mapped.shouldRetry).toBe(false);
    expect(mapped.message).toContain("project, location and certificate map");
  });

  test("wraps non-HTTP failures without losing the cause", () => {
    const mapped = mapGcpError(new Error("socket hang up"), context);
    expect(mapped.message).toContain("socket hang up");
  });
});

describe("GCP error inspectors", () => {
  test("reads the Google status and HTTP status", () => {
    const error = googleError(409, "ALREADY_EXISTS", "already exists");
    expect(getGcpErrorStatus(error)).toBe("ALREADY_EXISTS");
    expect(getGcpHttpStatus(error)).toBe(409);
  });

  test("returns undefined for non-Axios errors", () => {
    expect(getGcpErrorStatus(new Error("boom"))).toBeUndefined();
    expect(getGcpHttpStatus(new Error("boom"))).toBeUndefined();
  });

  test("recognizes a delete blocked by a certificate map entry", () => {
    expect(
      isCertificateInUseError(
        googleError(400, "FAILED_PRECONDITION", "The certificate is in use by a certificate map entry")
      )
    ).toBe(true);
    expect(isCertificateInUseError(googleError(400, "INVALID_ARGUMENT", "pem_certificate is malformed"))).toBe(false);
  });
});

describe("isCertificateInUseError classification", () => {
  test("treats a precondition failure naming a map entry as in-use", () => {
    expect(
      isCertificateInUseError(
        googleError(400, "FAILED_PRECONDITION", "The certificate is in use by a certificate map entry")
      )
    ).toBe(true);
  });

  test("does not mistake an IAM failure that mentions certificate maps for an in-use conflict", () => {
    expect(
      isCertificateInUseError(
        googleError(403, "PERMISSION_DENIED", "Permission certificatemanager.certmaps.get denied on certificate map")
      )
    ).toBe(false);
  });
});

// pki_syncs.lastSyncMessage is varchar(255); an over-long message makes the queue's status write
// fail, which leaves the sync reporting "running" forever with no error shown to the user.
describe("mapped messages fit the lastSyncMessage column", () => {
  const longGoogleMessage =
    'certificate "projects/202604160721/locations/global/certificates/infisical-69c59d616e214cf59eff4837efd3b179" does not cover map entry hostname "live.example.com"';

  const map = (error: unknown) =>
    mapGcpError(error, {
      operation: "certificate map entry creation",
      gcpProjectId: "crested-trilogy-457818-q2",
      resource: 'certificate map entry "infisical-3b223ee0-917a-40fa-a6b9-e59e995b1b28"',
      permission: gcpCertificateMapEntryPermission(GcpCertificateManagerAction.Create)
    });

  test.each([
    ["INVALID_ARGUMENT with a long Google message", googleError(400, "INVALID_ARGUMENT", longGoogleMessage)],
    ["PERMISSION_DENIED", googleError(403, "PERMISSION_DENIED", longGoogleMessage)],
    ["NOT_FOUND", googleError(404, "NOT_FOUND", longGoogleMessage)],
    ["unmapped status", googleError(500, "INTERNAL", longGoogleMessage)]
  ])("%s fits the column", (_label, error) => {
    expect(map(error).message.length).toBeLessThanOrEqual(1024);
  });

  test.each([
    ["INVALID_ARGUMENT", googleError(400, "INVALID_ARGUMENT", longGoogleMessage)],
    ["unmapped status", googleError(500, "INTERNAL", longGoogleMessage)]
  ])("%s keeps Google's reason instead of truncating it away", (_label, error) => {
    expect(map(error).message).toContain("does not cover map entry hostname");
  });
});
