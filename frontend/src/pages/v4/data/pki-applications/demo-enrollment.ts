import { AppConnection } from "@app/hooks/api/appConnections/enums";
import type { TAppConnection, TAvailableAppConnection } from "@app/hooks/api/appConnections/types";
import { MicrosoftIntuneConnectionMethod } from "@app/hooks/api/appConnections/types/microsoft-intune-connection";
import { CaType } from "@app/hooks/api/ca/enums";
import {
  ScepChallengeType,
  type TPkiApplicationEnrollmentState
} from "@app/hooks/api/pkiApplications/types";

import { V4_DEMO_ORG_ID } from "../../mode";
import { createFixtureStore, fixtureMutation } from "../fixture-store";
import type { PkiApplicationsEnrollmentAdapter } from "./contract-enrollment";
import {
  DEMO_PROJECT_ID,
  demoApplications,
  demoProfiles,
  type EnrollmentMethodKey,
  setDemoProfileMethod
} from "./demo-store";

const SITE_URL = "https://app.infisical.com";

const ready = <T>(data: T) => ({ data, isPending: false, error: null });

const keyOf = (applicationId: string, profileId: string) => `${applicationId}:${profileId}`;

const pathOf = (applicationId: string, profileId: string) =>
  `applications/${applicationId}/profiles/${profileId}`;

const RA_CERTIFICATE_PEM = [
  "-----BEGIN CERTIFICATE-----",
  "MIIDnzCCAoegAwIBAgIUQ3k1b0Zr8mJ2c9Yw4hT6xLp0sVQwDQYJKoZIhvcNAQEL",
  "BQAwPzELMAkGA1UEBhMCVVMxFjAUBgNVBAoMDUFjbWUgUGF5bWVudHMxGDAWBgNV",
  "BAMMD0FjbWUgSXNzdWluZyBDQTAeFw0yNjA4MTkyMTEwMDBaFw0yNzA4MTkyMTEw",
  "MDBaMDsxCzAJBgNVBAYTAlVTMRYwFAYDVQQKDA1BY21lIFBheW1lbnRzMRQwEgYD",
  "VQQDDAtTQ0VQIFJBIENlcnQwggEiMA0GCSqGSIb3DQEBAQUAA4IBDwAwggEKAoIB",
  "-----END CERTIFICATE-----"
].join("\n");

const emptyState = (applicationId: string, profileId: string): TPkiApplicationEnrollmentState => ({
  applicationId,
  profileId,
  api: null,
  est: null,
  acme: null,
  scep: null,
  caType: CaType.INTERNAL,
  estConfigured: false,
  acmeConfigured: false,
  scepConfigured: false
});

const apiConfig = (
  applicationId: string,
  profileId: string,
  autoRenew: boolean,
  renewBeforeDays: number | null
) => ({ id: `api-${applicationId}-${profileId}`, autoRenew, renewBeforeDays });

const estConfig = (applicationId: string, profileId: string, disableBootstrap: boolean) => ({
  id: `est-${applicationId}-${profileId}`,
  disableBootstrapCaValidation: disableBootstrap,
  estEndpointUrl: `${SITE_URL}/.well-known/est/${pathOf(applicationId, profileId)}`
});

const acmeConfig = (
  applicationId: string,
  profileId: string,
  flags: { skipDnsOwnershipVerification?: boolean; skipEabBinding?: boolean }
) => ({
  id: `acme-${applicationId}-${profileId}`,
  skipDnsOwnershipVerification: Boolean(flags.skipDnsOwnershipVerification),
  skipEabBinding: Boolean(flags.skipEabBinding),
  directoryUrl: `${SITE_URL}/api/v1/cert-manager/acme/${pathOf(applicationId, profileId)}/directory`
});

type ScepSettings = {
  challengeType: ScepChallengeType;
  includeCaCertInResponse: boolean;
  allowCertBasedRenewal: boolean;
  dynamicChallengeExpiryMinutes: number | null;
  dynamicChallengeMaxPending: number | null;
  validationConnectionId: string | null;
  signRaWithCa: boolean;
};

const scepConfig = (applicationId: string, profileId: string, settings: ScepSettings) => ({
  id: `scep-${applicationId}-${profileId}`,
  ...settings,
  scepEndpointUrl: `${SITE_URL}/scep/${pathOf(applicationId, profileId)}/pkiclient.exe`,
  challengeEndpointUrl:
    settings.challengeType === ScepChallengeType.DYNAMIC
      ? `${SITE_URL}/scep/${pathOf(applicationId, profileId)}/challenge`
      : null,
  raCertificatePem: RA_CERTIFICATE_PEM,
  raCertExpiresAt: "2027-08-19T21:10:00Z"
});

const INTUNE_CONNECTION_ID = "b17c4e92-3a5d-4f08-9c61-2e8d7a0f5b34";

const intuneConnections = createFixtureStore<TAvailableAppConnection[]>([
  { id: INTUNE_CONNECTION_ID, name: "intune-warehouse-tenant", projectId: DEMO_PROJECT_ID },
  { id: "e5a90d13-7c2b-4e6f-8a14-9d3b6f1c0e27", name: "intune-corporate", projectId: null }
]);

const appName = (applicationId: string) =>
  demoApplications.get().find((entry) => entry.id === applicationId)?.name;

const seed = () =>
  Object.fromEntries(
    demoProfiles.get().map((profile) => {
      const { applicationId, profileId } = profile;
      const state = emptyState(applicationId, profileId);
      if (profile.apiConfigId) state.api = apiConfig(applicationId, profileId, true, 30);
      if (profile.estConfigId) {
        state.est = estConfig(applicationId, profileId, false);
        state.estConfigured = true;
      }
      if (profile.acmeConfigId) {
        state.acme = acmeConfig(applicationId, profileId, {
          skipDnsOwnershipVerification: appName(applicationId) === "platform-core"
        });
        state.acmeConfigured = true;
      }
      if (profile.scepConfigId) {
        state.scep = scepConfig(applicationId, profileId, {
          challengeType: ScepChallengeType.MICROSOFT_INTUNE,
          includeCaCertInResponse: true,
          allowCertBasedRenewal: false,
          dynamicChallengeExpiryMinutes: null,
          dynamicChallengeMaxPending: null,
          validationConnectionId: INTUNE_CONNECTION_ID,
          signRaWithCa: true
        });
        state.scepConfigured = true;
      }
      return [keyOf(applicationId, profileId), state];
    })
  );

const states = createFixtureStore<Record<string, TPkiApplicationEnrollmentState>>(seed());

const eabSecrets = createFixtureStore<Record<string, string>>({});

const randomSecret = () =>
  btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

const isConfigured = (state: TPkiApplicationEnrollmentState, method: EnrollmentMethodKey) => {
  if (method === "api") return Boolean(state.api);
  if (method === "est") return state.estConfigured;
  if (method === "acme") return state.acmeConfigured;
  return state.scepConfigured;
};

const patch = (
  applicationId: string,
  profileId: string,
  method: EnrollmentMethodKey,
  change: (current: TPkiApplicationEnrollmentState) => TPkiApplicationEnrollmentState
) => {
  const key = keyOf(applicationId, profileId);
  states.update((current) => ({
    ...current,
    [key]: change(current[key] ?? emptyState(applicationId, profileId))
  }));
  const next = states.get()[key];
  setDemoProfileMethod(applicationId, profileId, method, isConfigured(next, method));
  return next;
};

export const enrollmentDemo: PkiApplicationsEnrollmentAdapter = {
  useEnrollment: (applicationId, profileId) =>
    ready(states.use()[keyOf(applicationId, profileId)] ?? emptyState(applicationId, profileId)),
  useEnrollmentPlan: () => ready({ est: true, scep: true }),
  useSetApiEnrollment: fixtureMutation(({ applicationId, profileId, autoRenew, renewBeforeDays }) =>
    patch(applicationId, profileId, "api", (current) => ({
      ...current,
      api: apiConfig(
        applicationId,
        profileId,
        autoRenew,
        autoRenew ? (renewBeforeDays ?? null) : null
      )
    }))
  ),
  useClearApiEnrollment: fixtureMutation(({ applicationId, profileId }) =>
    patch(applicationId, profileId, "api", (current) => ({ ...current, api: null }))
  ),
  useSetEstEnrollment: fixtureMutation(
    ({ applicationId, profileId, disableBootstrapCaValidation }) =>
      patch(applicationId, profileId, "est", (current) => ({
        ...current,
        est: estConfig(applicationId, profileId, Boolean(disableBootstrapCaValidation)),
        estConfigured: true
      }))
  ),
  useClearEstEnrollment: fixtureMutation(({ applicationId, profileId }) =>
    patch(applicationId, profileId, "est", (current) => ({
      ...current,
      est: null,
      estConfigured: false
    }))
  ),
  useSetAcmeEnrollment: fixtureMutation(({ applicationId, profileId, ...flags }) =>
    patch(applicationId, profileId, "acme", (current) => ({
      ...current,
      acme: acmeConfig(applicationId, profileId, flags),
      acmeConfigured: true
    }))
  ),
  useClearAcmeEnrollment: fixtureMutation(({ applicationId, profileId }) =>
    patch(applicationId, profileId, "acme", (current) => ({
      ...current,
      acme: null,
      acmeConfigured: false
    }))
  ),
  useRevealAcmeEabSecret: fixtureMutation(({ applicationId, profileId }) => {
    const key = keyOf(applicationId, profileId);
    if (!eabSecrets.get()[key])
      eabSecrets.update((current) => ({ ...current, [key]: randomSecret() }));
    return {
      applicationId,
      profileId,
      eabKid: `kid-${applicationId.slice(0, 8)}-${profileId.slice(0, 8)}`,
      eabSecret: eabSecrets.get()[key]
    };
  }),
  useRotateAcmeEabSecret: fixtureMutation(({ applicationId, profileId }) => {
    eabSecrets.update((current) => ({
      ...current,
      [keyOf(applicationId, profileId)]: randomSecret()
    }));
    return { applicationId, profileId };
  }),
  useSetScepEnrollment: fixtureMutation(({ applicationId, profileId, ...input }) =>
    patch(applicationId, profileId, "scep", (current) => {
      const challengeType = input.challengeType ?? ScepChallengeType.STATIC;
      const isDynamic = challengeType === ScepChallengeType.DYNAMIC;
      return {
        ...current,
        scep: scepConfig(applicationId, profileId, {
          challengeType,
          includeCaCertInResponse: input.includeCaCertInResponse ?? true,
          allowCertBasedRenewal: input.allowCertBasedRenewal ?? true,
          dynamicChallengeExpiryMinutes: isDynamic
            ? (input.dynamicChallengeExpiryMinutes ?? 60)
            : null,
          dynamicChallengeMaxPending: isDynamic ? (input.dynamicChallengeMaxPending ?? 100) : null,
          validationConnectionId: input.validationConnectionId ?? null,
          signRaWithCa: current.scep?.signRaWithCa ?? Boolean(input.signRaWithCa)
        }),
        scepConfigured: true
      };
    })
  ),
  useClearScepEnrollment: fixtureMutation(({ applicationId, profileId }) =>
    patch(applicationId, profileId, "scep", (current) => ({
      ...current,
      scep: null,
      scepConfigured: false
    }))
  ),
  useIntuneConnections: (projectId) =>
    ready(
      intuneConnections.use().filter((entry) => !entry.projectId || entry.projectId === projectId)
    ),
  useCreateIntuneConnection: fixtureMutation((input) => {
    const now = new Date().toISOString();
    const created = {
      id: crypto.randomUUID(),
      name: input.name,
      description: input.description ?? null,
      version: 1,
      orgId: V4_DEMO_ORG_ID,
      projectId: input.projectId ?? DEMO_PROJECT_ID,
      createdAt: now,
      updatedAt: now,
      app: AppConnection.MicrosoftIntune,
      method: MicrosoftIntuneConnectionMethod.ClientSecret,
      credentials: { tenantId: "", clientId: "", clientSecret: "" }
    } as TAppConnection;
    intuneConnections.update((current) => [
      ...current,
      { id: created.id, name: created.name, projectId: created.projectId }
    ]);
    return created;
  })
};
