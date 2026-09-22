import { TCertificateRequests } from "@app/db/schemas";

import { CertificateRequestStatus } from "../../certificate-common/certificate-constants";
import { PkiAlertEventType } from "../../pki-alert-v2/pki-alert-v2-types";
import { TGoDaddyApiClient } from "./godaddy-api-client";
import { GoDaddyCertificateStatus } from "./godaddy-certificate-authority-enums";
import { GoDaddyRenewalNotReadyError } from "./godaddy-certificate-authority-fns";
import {
  processGoDaddyPendingValidationRequest,
  TProcessGoDaddyRequestDeps
} from "./godaddy-certificate-authority-processor";

vi.mock("@app/lib/logger", () => ({
  logger: {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {}
  },
  initLogger: () => {}
}));

const ISSUED_CERTIFICATE_ID = "22222222-2222-4222-8222-222222222222";

const buildRequest = (overrides: Partial<TCertificateRequests> = {}, isRenewal = false): TCertificateRequests =>
  ({
    id: "request-1",
    caId: "ca-1",
    projectId: "project-1",
    profileId: "profile-1",
    applicationId: null,
    commonName: "example.com",
    altNames: null,
    keyUsages: [],
    extendedKeyUsages: [],
    keyAlgorithm: "RSA_2048",
    signatureAlgorithm: "RSA-SHA256",
    encryptedPrivateKey: null,
    metadata: JSON.stringify({
      godaddy: {
        certificateId: "gd-cert-1",
        productType: "DV_SSL",
        orderPlacedAt: new Date().toISOString(),
        isRenewal
      }
    }),
    ...overrides
  }) as TCertificateRequests;

const buildDeps = (opts?: { queueError?: Error; fetchError?: Error }) => {
  const queuedEvents: unknown[] = [];
  const attached: unknown[] = [];

  const deps: TProcessGoDaddyRequestDeps = {
    certificateAuthorityDAL: { findByIdWithAssociatedCa: async () => ({}) } as never,
    appConnectionDAL: { findById: async () => null } as never,
    kmsService: {} as never,
    certificateRequestDAL: { updateById: async () => ({}), setPendingMessage: async () => ({}) } as never,
    certificateRequestService: {
      updateCertificateRequestStatus: async () => ({}),
      attachCertificateToRequest: async (args: unknown) => {
        attached.push(args);
      }
    },
    resourceMetadataDAL: { find: async () => [], insertMany: async () => [] } as never,
    godaddyFns: {
      fetchAndAttachIssuedCertificate: async () => {
        if (opts?.fetchError) throw opts.fetchError;
        return { certificateId: ISSUED_CERTIFICATE_ID };
      }
    } as never,
    projectDAL: { findById: async () => ({ orgId: "org-1" }) } as never,
    telemetryService: { sendPostHogEvents: async () => {} } as never,
    pkiAlertV2Queue: {
      queueCertificateEvent: async (payload: unknown) => {
        if (opts?.queueError) throw opts.queueError;
        queuedEvents.push(payload);
      }
    }
  };

  return { deps, queuedEvents, attached };
};

const clientWithStatus = (status: GoDaddyCertificateStatus) =>
  ({ getCertificate: async () => ({ status }) }) as unknown as TGoDaddyApiClient;

const clientCacheFor = (client: TGoDaddyApiClient) => new Map([["ca-1", client]]);

describe("processGoDaddyPendingValidationRequest", () => {
  it("queues an issuance alert event with the attached certificate id once the certificate is issued", async () => {
    const { deps, queuedEvents, attached } = buildDeps();

    const result = await processGoDaddyPendingValidationRequest(
      deps,
      buildRequest(),
      clientCacheFor(clientWithStatus(GoDaddyCertificateStatus.Issued))
    );

    expect(result.status).toBe(CertificateRequestStatus.ISSUED);
    expect(attached).toEqual([{ certificateRequestId: "request-1", certificateId: ISSUED_CERTIFICATE_ID }]);
    expect(queuedEvents).toEqual([
      {
        certificateId: ISSUED_CERTIFICATE_ID,
        projectId: "project-1",
        eventType: PkiAlertEventType.ISSUANCE,
        applicationId: null
      }
    ]);
  });

  it("queues a renewal alert event scoped to the request application for renewals", async () => {
    const { deps, queuedEvents } = buildDeps();

    await processGoDaddyPendingValidationRequest(
      deps,
      buildRequest({ applicationId: "app-1" }, true),
      clientCacheFor(clientWithStatus(GoDaddyCertificateStatus.Current))
    );

    expect(queuedEvents).toEqual([
      {
        certificateId: ISSUED_CERTIFICATE_ID,
        projectId: "project-1",
        eventType: PkiAlertEventType.RENEWAL,
        applicationId: "app-1"
      }
    ]);
  });

  it("still finalises the request when queueing the alert event fails", async () => {
    const { deps, attached } = buildDeps({ queueError: new Error("redis down") });

    const result = await processGoDaddyPendingValidationRequest(
      deps,
      buildRequest(),
      clientCacheFor(clientWithStatus(GoDaddyCertificateStatus.Issued))
    );

    expect(result.status).toBe(CertificateRequestStatus.ISSUED);
    expect(attached).toHaveLength(1);
  });

  it("does not queue an alert event when a renewal is not yet re-issued", async () => {
    const { deps, queuedEvents, attached } = buildDeps({
      fetchError: new GoDaddyRenewalNotReadyError("not yet")
    });

    const result = await processGoDaddyPendingValidationRequest(
      deps,
      buildRequest({}, true),
      clientCacheFor(clientWithStatus(GoDaddyCertificateStatus.Current))
    );

    expect(result.status).toBe(CertificateRequestStatus.PENDING_VALIDATION);
    expect(attached).toEqual([]);
    expect(queuedEvents).toEqual([]);
  });

  it("does not queue an alert event while the certificate is still pending", async () => {
    const { deps, queuedEvents } = buildDeps();

    const result = await processGoDaddyPendingValidationRequest(
      deps,
      buildRequest(),
      clientCacheFor(clientWithStatus(GoDaddyCertificateStatus.PendingIssuance))
    );

    expect(result.status).toBe(CertificateRequestStatus.PENDING_VALIDATION);
    expect(queuedEvents).toEqual([]);
  });
});
