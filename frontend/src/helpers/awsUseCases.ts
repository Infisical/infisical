import { PkiSync } from "@app/hooks/api/pkiSyncs";
import { SecretSync } from "@app/hooks/api/secretSyncs";

// Mirrors the ids and labels in docs/snippets/app-connections/aws/use-cases.jsx, which the
// Provisioning template is generated from. Keep them in sync.
export const AWS_USE_CASE_GROUPS = [
  {
    label: "Secret syncs",
    options: [
      { id: "secrets-manager", label: "AWS Secrets Manager sync" },
      { id: "parameter-store", label: "AWS Parameter Store sync" }
    ]
  },
  {
    label: "Secret rotation and detection",
    options: [
      { id: "iam-rotation", label: "AWS IAM user secret rotation" },
      { id: "honey-tokens", label: "AWS honey tokens" }
    ]
  },
  {
    label: "Certificates",
    options: [
      { id: "acm-sync", label: "AWS Certificate Manager sync" },
      { id: "elb-sync", label: "AWS Elastic Load Balancer sync" },
      { id: "pki-secrets-manager", label: "AWS Secrets Manager certificate sync" },
      { id: "private-ca", label: "AWS Private CA" },
      { id: "acm-public-ca", label: "AWS Certificate Manager public CA" },
      { id: "acme-route53", label: "ACME CA with Route 53" }
    ]
  },
  {
    label: "Session recording",
    options: [
      { id: "pam-recording", label: "PAM session recording" },
      { id: "agent-vault-session-logs", label: "Agent Vault session logs" }
    ]
  }
] as const;

export const getAwsUpdateStackHint = ({
  recordedUseCases,
  neededUseCases,
  canEdit
}: {
  recordedUseCases?: string[] | null;
  neededUseCases: string[];
  canEdit: boolean;
}) => {
  if (!recordedUseCases) return { show: false, missingUseCases: [] };

  const missingUseCases = neededUseCases.filter((id) => !recordedUseCases.includes(id));
  return { show: canEdit && missingUseCases.length > 0, missingUseCases };
};

export const AGENT_VAULT_SESSION_LOGS_USE_CASES = ["agent-vault-session-logs"];

export const AWS_SECRET_SYNC_USE_CASES: Partial<Record<SecretSync, string[]>> = {
  [SecretSync.AWSSecretsManager]: ["secrets-manager"],
  [SecretSync.AWSParameterStore]: ["parameter-store"]
};

export const AWS_PKI_SYNC_USE_CASES: Partial<Record<PkiSync, string[]>> = {
  [PkiSync.AwsCertificateManager]: ["acm-sync"],
  [PkiSync.AwsElasticLoadBalancer]: ["elb-sync"],
  [PkiSync.AwsSecretsManager]: ["pki-secrets-manager"]
};
