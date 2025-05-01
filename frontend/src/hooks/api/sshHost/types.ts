export enum LoginMappingSource {
  HOST = "host",
  HOST_GROUP = "hostGroup"
}

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
    };
    source: LoginMappingSource;
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
    };
  }[];
};

export type TDeleteSshHostDTO = {
  sshHostId: string;
};
