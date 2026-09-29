import {
  CERT_MANAGER_APPLICATION_RESOURCE_TYPE,
  CERT_MANAGER_CERTIFICATE_RESOURCE_TYPE,
  CertificateAlertEvent,
  certificateAlertEventEmitterFactory,
  ProjectCertificateAlertEvent
} from "./certificate-alert-events";

const buildEmitter = () => {
  const emitted: { eventType: string; payload: Record<string, unknown> }[] = [];
  const emitter = certificateAlertEventEmitterFactory({
    eventEmitter: {
      emit: async (event: { eventType: string; payload: Record<string, unknown> }) => {
        emitted.push(event);
      }
    } as never,
    projectDAL: {
      findById: async () => ({ orgId: "org-1" }),
      transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn({})
    } as never,
    pkiAlertV2Queue: { queueCertificateEvent: async () => undefined }
  });
  return { emitter, emitted };
};

describe("certificate alert event emitter", () => {
  test("emits the project-wide event for a certificate outside any application", async () => {
    const { emitter, emitted } = buildEmitter();
    await emitter.emit(
      { certificateId: "cert-1", projectId: "proj-1", eventType: CertificateAlertEvent.Issuance },
      {} as never
    );

    expect(emitted).toEqual([
      {
        eventType: ProjectCertificateAlertEvent.Issuance,
        payload: {
          orgId: "org-1",
          projectId: "proj-1",
          resourceType: CERT_MANAGER_CERTIFICATE_RESOURCE_TYPE,
          resourceId: null,
          targetIds: ["cert-1"]
        }
      }
    ]);
  });

  test("emits both the project-wide and the application event for an application certificate", async () => {
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
      [ProjectCertificateAlertEvent.Revocation, CERT_MANAGER_CERTIFICATE_RESOURCE_TYPE, null],
      [CertificateAlertEvent.Revocation, CERT_MANAGER_APPLICATION_RESOURCE_TYPE, "app-1"]
    ]);
  });
});
