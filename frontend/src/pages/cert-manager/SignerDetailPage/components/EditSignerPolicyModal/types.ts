import { PkiDocsUrls } from "../../../pki-docs-urls";

export type ApproverKind = "user" | "group";
export type ApproverOption = { value: string; label: string; kind: ApproverKind };

export type StepDraft = {
  key: string;
  name: string;
  approvers: ApproverOption[];
  requiredApprovals: number;
};

export const approverKey = (kind: ApproverKind, id: string) => `${kind}:${id}`;

export const APPROVERS_STEP = {
  title: "Approvers",
  subtitle: "Who approves",
  docsUrl: PkiDocsUrls.codeSigning.approvals.approvers
} as const;
export const LIMITS_STEP = {
  title: "Approval limits",
  subtitle: "What each approval allows",
  docsUrl: PkiDocsUrls.codeSigning.approvals.limits
} as const;

export const NO_WINDOW_LIMIT = "__no_limit__";
export const WINDOW_DURATION_OPTIONS = [
  { label: "No limit", value: NO_WINDOW_LIMIT },
  { label: "1 hour", value: "1h" },
  { label: "8 hours", value: "8h" },
  { label: "24 hours", value: "24h" },
  { label: "7 days", value: "7d" },
  { label: "30 days", value: "30d" }
];

export const newStepDraft = (): StepDraft => ({
  key: crypto.randomUUID(),
  name: "",
  approvers: [],
  requiredApprovals: 1
});
