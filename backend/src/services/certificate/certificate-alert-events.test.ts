import {
  CERT_MANAGER_APPLICATION_RESOURCE_TYPE,
  CertificateAlertEvent,
  certificateAlertEventEmitterFactory
} from "./certificate-alert-events";

const buildEmitter = () => {
  const emitted: { eventType: string; payload: Record<string, unknown> }[] = [];
  const emitter = certificateAlertEventEmitterFactory({
    eventEmitter: {
      emit: async (event: { eventType: string; payload: Record<string, unknown> }) => {
        emitted.push(event);
      }
    } as never,
    projectDAL: { findById: async () => ({ orgId: "org-1" }) } as never
  });
  return { emitter, emitted };
};

describe("certificate alert event emitter", () => {
  test("emits one event without a resource for a certificate outside any application", async () => {
    const { emitter, emitted } = buildEmitter();
    await emitter.emit(
      { certificateId: "cert-1", projectId: "proj-1", eventType: CertificateAlertEvent.Issuance },
      {} as never
    );

    expect(emitted).toEqual([
      {
        eventType: CertificateAlertEvent.Issuance,
        payload: {
          orgId: "org-1",
          projectId: "proj-1",
          resourceType: CERT_MANAGER_APPLICATION_RESOURCE_TYPE,
          resourceId: null,
          targetIds: ["cert-1"]
        }
      }
    ]);
  });

  test("emits one event bound to the application for an application certificate", async () => {
    const { emitter, emitted } = buildEmitter();
    await emitter.emit(
      {
        certificateId: "cert-1",
        projectId: "proj-1",
        orgId: "org-1",
        applicationId: "app-1",
        eventType: CertificateAlertEvent.Revocation
      },
      {} as never
    );

    expect(emitted.map((event) => [event.eventType, event.payload.resourceType, event.payload.resourceId])).toEqual([
      [CertificateAlertEvent.Revocation, CERT_MANAGER_APPLICATION_RESOURCE_TYPE, "app-1"]
    ]);
  });
});
