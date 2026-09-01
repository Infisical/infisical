export type TOrgProductStatsDTO = {
  actorOrgId: string;
};

export type TOrgProductStats = {
  secretManager: {
    secretsCount: number;
    environmentsCount: number;
    projectsCount: number;
  };
  certificateManager: {
    certificatesCount: number;
    certificateAuthoritiesCount: number;
    signersCount: number;
  };
  kms: {
    keysCount: number;
    clientsCount: number;
    projectsCount: number;
  };
  secretScanning: {
    dataSourcesCount: number;
    resourcesCount: number;
    projectsCount: number;
  };
  pam: {
    accountsCount: number;
    accountTemplatesCount: number;
    foldersCount: number;
  };
};
