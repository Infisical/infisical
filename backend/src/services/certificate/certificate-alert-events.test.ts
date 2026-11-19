import {
  CERT_MANAGER_APPLICATION_RESOURCE_TYPE,
  certificateAlertEventEmitterFactory,
  CertificateApplicationAlertEvent
} from "./certificate-alert-events";

const buildEmitter = () => {
  const emitted: { id: string; type: string; data: Record<string, unknown> }[] = [];
  const emitter = certificateAlertEventEmitterFactory({
    eventEmitter: {
      emit: async (events: { id: string; type: string; data: Record<string, unknown> }[]) => {
        emitted.push(...events);
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
      { certificateId: "cert-1", projectId: "proj-1", eventType: CertificateApplicationAlertEvent.Issuance },
      {} as never
    );

    expect(emitted).toEqual([
      {
        id: expect.any(String) as string,
        type: CertificateApplicationAlertEvent.Issuance,
        data: {
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
        eventType: CertificateApplicationAlertEvent.Revocation
      },
      {} as never
    );

    expect(emitted.map((event) => [event.type, event.data.resourceType, event.data.resourceId])).toEqual([
      [CertificateApplicationAlertEvent.Revocation, CERT_MANAGER_APPLICATION_RESOURCE_TYPE, "app-1"]
    ]);
  });
});
