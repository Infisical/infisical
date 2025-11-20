export const getDefaultOnPremFeatures = () => {
  return {
    _id: null,
    slug: null,
    tier: -1,
    workspaceLimit: null,
    workspacesUsed: 0,
    memberLimit: null,
    membersUsed: 0,
    identityLimit: null,
    identitiesUsed: 0,
    environmentLimit: null,
    environmentsUsed: 0,
    secretVersioning: true,
    pitRecovery: false,
    ipAllowlisting: true,
    rbac: false,
    customRateLimits: false,
    customAlerts: false,
    auditLogs: false,
    auditLogsRetentionDays: 0,
    samlSSO: false,
    scim: false,
    ldap: false,
    groups: false,
    status: null,
    trial_end: null,
    has_used_trial: true,
    secretApproval: true,
    secretRotation: true,
    caCrl: false,
    sshHostGroups: false,
    enterpriseSecretSyncs: false,
    enterpriseCertificateSyncs: false,
    enterpriseAppConnections: true,
    machineIdentityAuthTemplates: false,
    pkiLegacyTemplates: false
  };
};

export const setupLicenseRequestWithStore = () => {};

export const getLicenseKeyConfig = () => {
  return {
    isValid: false
  };
};
