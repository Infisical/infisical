import { CertKeySource, SignerKeyAlgorithm, SignerMemberRole } from "@app/hooks/api/signers";

import { PkiDocsUrls } from "../../../pki-docs-urls";

export type CaGroup = "internal" | "external";
export type CaOption = { id: string; name: string; groupType: CaGroup };
export type MemberOption = { value: string; label: string };
export type ApproverOption = { value: string; label: string; kind: "user" | "group" };

export const approverOptionKey = (o: ApproverOption | { kind: "user" | "group"; value: string }) =>
  `${o.kind}:${o.value}`;

export type MemberKind = "user" | "identity" | "group";

export const KIND_LABEL: Record<MemberKind, string> = {
  user: "User",
  identity: "Machine Identity",
  group: "Group"
};

export type PendingMember = {
  kind: MemberKind;
  id: string;
  label: string;
  role: SignerMemberRole;
};

export type PolicyStep = {
  key: string;
  name: string;
  approverUserIds: string[];
  approverGroupIds: string[];
  requiredApprovals: number;
};

export type WizardState = {
  name: string;
  description: string;
  caId: string;
  commonName: string;
  certificateTtlDays: number;
  certificateRenewBeforeDays: number | null;
  keyAlgorithm: SignerKeyAlgorithm;
  keySource: CertKeySource;
  hsmConnectorId: string | null;
  pendingMembers: PendingMember[];
  policySteps: PolicyStep[];
  maxSignings: number | null;
  maxWindowDuration: string | null;
};

export const INITIAL_WIZARD_STATE: WizardState = {
  name: "",
  description: "",
  caId: "",
  commonName: "",
  certificateTtlDays: 365,
  certificateRenewBeforeDays: null,
  keyAlgorithm: SignerKeyAlgorithm.RSA_2048,
  keySource: CertKeySource.Infisical,
  hsmConnectorId: null,
  pendingMembers: [],
  policySteps: [],
  maxSignings: null,
  maxWindowDuration: null
};

export type WizardStep = {
  name: string;
  shortDescription: string;
  title: string;
  subtitle: string;
  rightLabel: string;
  rightDescription: string;
  docsUrl: string;
};

export const STEPS: WizardStep[] = [
  {
    name: "Basics",
    shortDescription: "Name and description",
    title: "Basics",
    subtitle: "A short name and what this signer is for.",
    rightLabel: "BASICS",
    rightDescription:
      "Set the signer's name and a short description so your team knows what it signs (for example, mobile-app-prod for production iOS and Android bundles).",
    docsUrl: PkiDocsUrls.codeSigning.signers.basics
  },
  {
    name: "Certificate",
    shortDescription: "How it signs",
    title: "Certificate",
    subtitle: "Pick the Certificate Authority and the name on the certificate.",
    rightLabel: "CERTIFICATE",
    rightDescription:
      "Tells Infisical which CA issues the signing certificate, the name shown on it, and how long it stays valid. The Common Name is fixed once issued. Pick the key source: Infisical or HSM (the keypair stays inside your own HSM).",
    docsUrl: PkiDocsUrls.codeSigning.signers.certificate
  },
  {
    name: "Members",
    shortDescription: "Who can sign",
    title: "Members",
    subtitle: "Add users, machine identities, or groups that can work with this signer.",
    rightLabel: "MEMBERS",
    rightDescription:
      "Choose who gets access. Each member has a role: Administrators manage the signer, Operators sign artifacts, Auditors read activity but cannot sign.",
    docsUrl: PkiDocsUrls.codeSigning.signers.members
  },
  {
    name: "Approval Policy",
    shortDescription: "How approval works",
    title: "Approval Policy",
    subtitle: "Decide if signing needs approval, who approves it, and what each approval allows.",
    rightLabel: "APPROVAL POLICY",
    rightDescription:
      "When approval is on, members ask before signing. Steps run in order with approvers per step. Limits cap how many signatures and how long each approval is valid.",
    docsUrl: PkiDocsUrls.codeSigning.approvals.policy
  }
];

export const NO_WINDOW_LIMIT = "__no_limit__";

export const WINDOW_DURATION_OPTIONS = [
  { label: "No limit", value: NO_WINDOW_LIMIT },
  { label: "1 hour", value: "1h" },
  { label: "8 hours", value: "8h" },
  { label: "24 hours", value: "24h" },
  { label: "7 days", value: "7d" },
  { label: "30 days", value: "30d" }
];

let stepCounter = 0;
export const makeStepKey = () => {
  stepCounter += 1;
  return `step-${Date.now()}-${stepCounter}`;
};
