import type { ReactNode } from "react";

import type { TPkiApplicationEnrollmentState } from "@app/hooks/api/pkiApplications/types";

export type EnrollmentMethod = "api" | "est" | "acme" | "scep";

export const ENROLLMENT_METHODS: EnrollmentMethod[] = ["api", "est", "acme", "scep"];

export const METHOD_LABELS: Record<EnrollmentMethod, string> = {
  api: "API",
  est: "EST",
  acme: "ACME",
  scep: "SCEP"
};

const DOCS_BASE_URL = "https://infisical.com/docs/documentation/platform/pki/applications";

export const ENROLLMENT_DOCS = {
  overview: `${DOCS_BASE_URL}/enrollment-methods/overview`,
  apiReference:
    "https://infisical.com/docs/api-reference/endpoints/certificates/create-certificate",
  intune: "https://infisical.com/docs/integrations/app-connections/microsoft-intune"
};

export const isMethodConfigured = (
  state: TPkiApplicationEnrollmentState,
  method: EnrollmentMethod
) => {
  if (method === "api") return Boolean(state.api);
  if (method === "est") return state.estConfigured;
  if (method === "acme") return state.acmeConfigured;
  return state.scepConfigured;
};

export type ApiDraft = { autoRenew: boolean; renewBeforeDays: string };
export type EstDraft = {
  passphrase: string;
  caChain: string;
  disableBootstrapCaValidation: boolean;
};
export type AcmeDraft = { skipDnsOwnershipVerification: boolean; skipEabBinding: boolean };
export type ScepDraft = {
  challengeType: string;
  challengePassword: string;
  includeCaCertInResponse: boolean;
  allowCertBasedRenewal: boolean;
  dynamicChallengeExpiryMinutes: string;
  dynamicChallengeMaxPending: string;
  validationConnectionId: string;
  signRaWithCa: boolean;
};
export type EnrollmentDrafts = {
  api?: ApiDraft;
  est?: EstDraft;
  acme?: AcmeDraft;
  scep?: ScepDraft;
};

export type EnrollmentPanelProps<M extends EnrollmentMethod> = {
  applicationId: string;
  profileId: string;
  profileSlug: string;
  projectId: string;
  state: TPkiApplicationEnrollmentState;
  header: ReactNode;
  draft: EnrollmentDrafts[M];
  onDraft: (draft: EnrollmentDrafts[M]) => void;
  onSaved: () => void;
  onCancel: () => void;
  busy: boolean;
  run: <T>(task: () => Promise<T>) => Promise<T>;
};

export const withDraft = <D extends object>(
  initial: D,
  draft: D | undefined,
  onDraft: (next: D | undefined) => void
) => {
  const value = draft ?? initial;
  const change = (patch: Partial<D>) => {
    const next = { ...value, ...patch };
    onDraft(JSON.stringify(next) === JSON.stringify(initial) ? undefined : next);
  };
  return { value, change };
};

export const parseCount = (raw: string) => {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  return /^\d+$/.test(trimmed) ? Number(trimmed) : Number.NaN;
};

export const countText = (value: number | null | undefined) =>
  value === null || value === undefined ? "" : String(value);
