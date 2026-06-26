/**
 * Centralized PKI documentation URLs.
 */

const PKI_DOCS_BASE_URL = "https://infisical.com/docs/documentation/platform/pki";

export const PkiDocsUrls = {
  // Overview
  overview: `${PKI_DOCS_BASE_URL}/overview`,
  gettingStarted: `${PKI_DOCS_BASE_URL}/getting-started`,
  migration: `${PKI_DOCS_BASE_URL}/migration`,

  // Quick starts
  quickStarts: {
    issueFirstCertificate: `${PKI_DOCS_BASE_URL}/quick-starts/issue-first-certificate`,
    signFirstCode: `${PKI_DOCS_BASE_URL}/quick-starts/sign-first-code`
  },

  // Reference
  reference: {
    pqcAlgorithms: `${PKI_DOCS_BASE_URL}/reference/pqc-algorithms`
  },

  // Settings (policies, profiles, cleanup, HSM connectors)
  settings: {
    policies: `${PKI_DOCS_BASE_URL}/settings/policies`,
    profiles: `${PKI_DOCS_BASE_URL}/settings/profiles`,
    certificateCleanup: `${PKI_DOCS_BASE_URL}/settings/certificate-cleanup`,
    hsmConnectors: `${PKI_DOCS_BASE_URL}/settings/hsm-connectors`
  },

  // Applications
  applications: {
    overview: `${PKI_DOCS_BASE_URL}/applications/overview`,
    certificates: `${PKI_DOCS_BASE_URL}/applications/certificates`,
    approvals: `${PKI_DOCS_BASE_URL}/applications/approvals`,
    enrollment: {
      overview: `${PKI_DOCS_BASE_URL}/applications/enrollment-methods/overview`,
      api: `${PKI_DOCS_BASE_URL}/applications/enrollment-methods/api`,
      acme: `${PKI_DOCS_BASE_URL}/applications/enrollment-methods/acme`,
      est: `${PKI_DOCS_BASE_URL}/applications/enrollment-methods/est`,
      scep: `${PKI_DOCS_BASE_URL}/applications/enrollment-methods/scep`
    },
    alerting: {
      overview: `${PKI_DOCS_BASE_URL}/applications/alerting/overview`,
      slack: `${PKI_DOCS_BASE_URL}/applications/alerting/slack-alerts`,
      pagerduty: `${PKI_DOCS_BASE_URL}/applications/alerting/pagerduty-alerts`,
      webhook: `${PKI_DOCS_BASE_URL}/applications/alerting/webhook-alerts`
    },
    syncs: {
      overview: `${PKI_DOCS_BASE_URL}/applications/certificate-syncs/overview`,
      awsAcm: `${PKI_DOCS_BASE_URL}/applications/certificate-syncs/aws-certificate-manager`,
      awsElb: `${PKI_DOCS_BASE_URL}/applications/certificate-syncs/aws-elastic-load-balancer`,
      awsSecretsManager: `${PKI_DOCS_BASE_URL}/applications/certificate-syncs/aws-secrets-manager`,
      azureKeyVault: `${PKI_DOCS_BASE_URL}/applications/certificate-syncs/azure-key-vault`,
      cloudflare: `${PKI_DOCS_BASE_URL}/applications/certificate-syncs/cloudflare-custom-certificate`,
      netscaler: `${PKI_DOCS_BASE_URL}/applications/certificate-syncs/netscaler`,
      chef: `${PKI_DOCS_BASE_URL}/applications/certificate-syncs/chef`
    }
  },

  // Certificate Authorities
  ca: {
    overview: `${PKI_DOCS_BASE_URL}/ca/overview`,
    internal: `${PKI_DOCS_BASE_URL}/ca/private-ca`,
    external: `${PKI_DOCS_BASE_URL}/ca/external-ca`,
    renewal: `${PKI_DOCS_BASE_URL}/ca/ca-renewal`,
    crlDistribution: `${PKI_DOCS_BASE_URL}/ca/crl-distribution`,
    // External CA types
    acmeCa: `${PKI_DOCS_BASE_URL}/ca/acme-ca`,
    awsAcmPublic: `${PKI_DOCS_BASE_URL}/ca/aws-acm-public-ca`,
    awsPca: `${PKI_DOCS_BASE_URL}/ca/aws-pca`,
    adcs: `${PKI_DOCS_BASE_URL}/ca/azure-adcs`,
    digicert: `${PKI_DOCS_BASE_URL}/ca/digicert`,
    digicertDirect: `${PKI_DOCS_BASE_URL}/ca/digicert-direct`,
    letsEncrypt: `${PKI_DOCS_BASE_URL}/ca/lets-encrypt`,
    sectigo: `${PKI_DOCS_BASE_URL}/ca/sectigo`,
    venafi: `${PKI_DOCS_BASE_URL}/ca/venafi`,
    venafiTpp: `${PKI_DOCS_BASE_URL}/ca/venafi-tpp`
  },

  // Code Signing
  codeSigning: {
    overview: `${PKI_DOCS_BASE_URL}/code-signing/overview`,
    signers: {
      overview: `${PKI_DOCS_BASE_URL}/code-signing/signers`,
      create: `${PKI_DOCS_BASE_URL}/code-signing/signers#create-a-signer`,
      basics: `${PKI_DOCS_BASE_URL}/code-signing/signers#basics`,
      certificate: `${PKI_DOCS_BASE_URL}/code-signing/signers#certificate`,
      members: `${PKI_DOCS_BASE_URL}/code-signing/signers#members`,
      edit: `${PKI_DOCS_BASE_URL}/code-signing/signers#edit-a-signer`,
      editBasics: `${PKI_DOCS_BASE_URL}/code-signing/signers#edit-basics`,
      editCertificate: `${PKI_DOCS_BASE_URL}/code-signing/signers#edit-certificate`
    },
    approvals: {
      overview: `${PKI_DOCS_BASE_URL}/code-signing/approvals`,
      policy: `${PKI_DOCS_BASE_URL}/code-signing/approvals#configure-the-approval-policy`,
      approvers: `${PKI_DOCS_BASE_URL}/code-signing/approvals#approvers`,
      limits: `${PKI_DOCS_BASE_URL}/code-signing/approvals#approval-limits`,
      preApprove: `${PKI_DOCS_BASE_URL}/code-signing/approvals#pre-approve-signing`,
      requestToSign: `${PKI_DOCS_BASE_URL}/code-signing/approvals#request-to-sign`,
      grantLifecycle: `${PKI_DOCS_BASE_URL}/code-signing/approvals#access-lifecycle`
    },
    pkcs11Module: `${PKI_DOCS_BASE_URL}/code-signing/pkcs11-module`,
    windowsKsp: `${PKI_DOCS_BASE_URL}/code-signing/windows-ksp`,
    connect: `${PKI_DOCS_BASE_URL}/code-signing/overview`
  },

  // Discovery
  discovery: {
    overview: `${PKI_DOCS_BASE_URL}/discovery/overview`,
    network: `${PKI_DOCS_BASE_URL}/discovery/network`
  },

  // Concepts
  concepts: {
    accessControl: `${PKI_DOCS_BASE_URL}/concepts/access-control`,
    certificateComponents: `${PKI_DOCS_BASE_URL}/concepts/certificate-components`,
    certificateLifecycle: `${PKI_DOCS_BASE_URL}/concepts/certificate-lifecycle`
  },

  // Guides
  guides: {
    overview: `${PKI_DOCS_BASE_URL}/guides/overview`
  }
} as const;
