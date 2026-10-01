// Options for the <UseCasePicker> on integrations/app-connections/aws.mdx. Each `id` must match a
// <UseCase use="..."> block on that page.
export const awsUseCaseGroups = [
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
];
