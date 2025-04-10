export type TSshHost = {
  id: string;
  projectId: string;
  hostname: string;
  userCertTtl: string;
  hostCertTtl: string;
  loginMappings: {
    loginUser: string;
    allowedPrincipals: {
      usernames: string[];
    };
  }[];
};

export type TCreateSshHostDTO = {
  projectId: string;
  hostname: string;
  userCertTtl?: string;
  hostCertTtl?: string;
  loginMappings: {
    loginUser: string;
    allowedPrincipals: {
      usernames: string[];
    };
  }[];
};

export type TUpdateSshHostDTO = {
  sshHostId: string;
  hostname?: string;
  userCertTtl?: string;
  hostCertTtl?: string;
  loginMappings?: {
    loginUser: string;
    allowedPrincipals: {
      usernames: string[];
    };
  }[];
};

export type TDeleteSshHostDTO = {
  sshHostId: string;
};
