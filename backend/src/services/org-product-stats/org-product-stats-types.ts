export type TOrgProductStatsDTO = {
  actorOrgId: string;
};

export type TOrgProductStats = {
  secretManager: {
    secretsCount: number;
    projectsCount: number;
  };
  certificateManager: {
    certificatesCount: number;
    certificateAuthoritiesCount: number;
  };
  kms: {
    keysCount: number;
    projectsCount: number;
  };
  secretScanning: {
    dataSourcesCount: number;
    projectsCount: number;
  };
  pam: {
    accountsCount: number;
    projectsCount: number;
  };
};
