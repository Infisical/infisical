import { CertificateAlertEventType } from "@app/hooks/api/alerts";

export enum CertificateAlertScopeKind {
  Application = "application",
  CertificateManager = "certificate-manager"
}

export type TCertificateAlertScope =
  | { kind: CertificateAlertScopeKind.Application; applicationId: string; applicationName: string }
  | { kind: CertificateAlertScopeKind.CertificateManager };

export type TCertificateFilterKind = "applicationIds" | "profileIds";

export type TProjectMemberEmails = {
  emailByUserId: Map<string, string>;
  memberIdByEmail: Map<string, string>;
  isAvailable: boolean;
};

export const MAX_CHANNELS = 10;

export const CERTIFICATE_ALERT_EVENT_LABELS: Record<CertificateAlertEventType, string> = {
  [CertificateAlertEventType.Expiry]: "Certificate Expiration",
  [CertificateAlertEventType.Issuance]: "Certificate Issuance",
  [CertificateAlertEventType.Renewal]: "Certificate Renewal",
  [CertificateAlertEventType.Revocation]: "Certificate Revocation"
};

const ALERT_EVENT_DESCRIPTIONS: Record<CertificateAlertEventType, (where: string) => string> = {
  [CertificateAlertEventType.Expiry]: () => "Fires ahead of a certificate's expiry date.",
  [CertificateAlertEventType.Issuance]: (where) =>
    `Fires when Infisical issues a certificate ${where}.`,
  [CertificateAlertEventType.Renewal]: (where) => `Fires when a certificate ${where} is renewed.`,
  [CertificateAlertEventType.Revocation]: (where) => `Fires when a certificate ${where} is revoked.`
};

export const getAlertEventDescription = (
  scope: TCertificateAlertScope,
  eventType: CertificateAlertEventType
) =>
  ALERT_EVENT_DESCRIPTIONS[eventType](
    scope.kind === CertificateAlertScopeKind.Application
      ? "in this application"
      : "in Certificate Manager"
  );

export const CERTIFICATE_FILTER_DEFINITIONS: Record<
  TCertificateFilterKind,
  { label: string; hint: string; allLabel: string }
> = {
  applicationIds: {
    label: "Applications",
    hint: "Certificates in one of these applications",
    allLabel: "All applications"
  },
  profileIds: {
    label: "Certificate Profiles",
    hint: "Issued from one of these profiles",
    allLabel: "All certificate profiles"
  }
};

export const NO_FILTERS_DESCRIPTION =
  "No filters. This alert covers every certificate in Certificate Manager.";

export enum CertificateAlertStep {
  Details = "details",
  Filters = "filters",
  Channels = "channels",
  Review = "review"
}

const STEP_DEFINITIONS = {
  [CertificateAlertStep.Details]: {
    name: "Details",
    shortDescription: "Event and name",
    title: "Alert Details",
    subtitle: "Choose the event that triggers this alert and name it."
  },
  [CertificateAlertStep.Filters]: {
    name: "Filters",
    shortDescription: "Which certificates",
    title: "Certificate Filters",
    subtitle: "Narrow which certificates this alert covers, or leave it on every certificate."
  },
  [CertificateAlertStep.Channels]: {
    name: "Channels",
    shortDescription: "Where it is sent",
    title: "Notification Channels",
    subtitle: "Add at least one destination for this alert."
  },
  [CertificateAlertStep.Review]: {
    name: "Review",
    shortDescription: "Confirm and save",
    title: "Review",
    subtitle: "Check the settings below before saving this alert."
  }
};

export const getSteps = (scope: TCertificateAlertScope) =>
  (scope.kind === CertificateAlertScopeKind.CertificateManager
    ? [
        CertificateAlertStep.Details,
        CertificateAlertStep.Filters,
        CertificateAlertStep.Channels,
        CertificateAlertStep.Review
      ]
    : [CertificateAlertStep.Details, CertificateAlertStep.Channels, CertificateAlertStep.Review]
  ).map((key) => ({ key, ...STEP_DEFINITIONS[key] }));
