/**
 * Centralized PAM documentation URLs.
 */

const PAM_DOCS_BASE_URL = "https://infisical.com/docs/documentation/platform/pam";

export const PamDocsUrls = {
  // Overview
  overview: `${PAM_DOCS_BASE_URL}/overview`,

  // Quick starts
  quickStarts: {
    launchFirstSession: `${PAM_DOCS_BASE_URL}/quick-starts/launch-first-session`
  },

  // Concepts
  concepts: {
    pamComponents: `${PAM_DOCS_BASE_URL}/concepts/pam-components`,
    sessionLifecycle: `${PAM_DOCS_BASE_URL}/concepts/session-lifecycle`,
    accessControl: `${PAM_DOCS_BASE_URL}/concepts/access-control`
  },

  // Guides
  guides: {
    teamAccess: `${PAM_DOCS_BASE_URL}/guides/team-access`,
    sshCertificateAuth: `${PAM_DOCS_BASE_URL}/guides/ssh-certificate-auth`
  },

  // Folders
  folders: {
    overview: `${PAM_DOCS_BASE_URL}/folders/overview`
  },

  // Templates
  templates: {
    overview: `${PAM_DOCS_BASE_URL}/templates/overview`
  },

  // Accounts
  accounts: {
    overview: `${PAM_DOCS_BASE_URL}/accounts/overview`,
    postgresql: `${PAM_DOCS_BASE_URL}/accounts/postgresql`,
    mysql: `${PAM_DOCS_BASE_URL}/accounts/mysql`,
    mssql: `${PAM_DOCS_BASE_URL}/accounts/mssql`,
    mongodb: `${PAM_DOCS_BASE_URL}/accounts/mongodb`,
    ssh: `${PAM_DOCS_BASE_URL}/accounts/ssh`,
    kubernetes: `${PAM_DOCS_BASE_URL}/accounts/kubernetes`,
    awsIam: `${PAM_DOCS_BASE_URL}/accounts/aws-iam`,
    windows: `${PAM_DOCS_BASE_URL}/accounts/windows`,
    windowsAd: `${PAM_DOCS_BASE_URL}/accounts/windows-ad`
  },

  // Sessions
  sessions: {
    overview: `${PAM_DOCS_BASE_URL}/sessions/overview`,
    sessionRecording: `${PAM_DOCS_BASE_URL}/sessions/session-recording`,
    externalStorage: `${PAM_DOCS_BASE_URL}/sessions/external-storage`
  },

  // Other
  auditing: `${PAM_DOCS_BASE_URL}/auditing`,
  architecture: `${PAM_DOCS_BASE_URL}/architecture`
} as const;
