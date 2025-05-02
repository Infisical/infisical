export type TSshHost = {
  id: string;
  projectId: string;
  hostname: string;
  alias: string | null;
  userCertTtl: string;
  hostCertTtl: string;
  loginMappings: {
    loginUser: string;
    allowedPrincipals: {
      usernames: string[];
      groups: string[];
    };
  }[];
};

export type TCreateSshHostDTO = {
  projectId: string;
  hostname: string;
  alias?: string;
  userCertTtl?: string;
  hostCertTtl?: string;
  loginMappings: {
    loginUser: string;
    allowedPrincipals: {
      usernames: string[];
      groups: string[];
    };
  }[];
};

export type TUpdateSshHostDTO = {
  sshHostId: string;
  hostname?: string;
  alias?: string;
  userCertTtl?: string;
  hostCertTtl?: string;
  loginMappings?: {
    loginUser: string;
    allowedPrincipals: {
      usernames: string[];
      groups: string[];
    };
  }[];
};

export type TDeleteSshHostDTO = {
  sshHostId: string;
};
