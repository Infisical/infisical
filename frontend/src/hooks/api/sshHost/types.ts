export enum LoginMappingSource {
  HOST = "host",
  HOST_GROUP = "hostGroup"
}

export type TLoginMapping = {
  loginUser: string;
  allowedPrincipals: {
    usernames?: string[];
    groups?: string[];
  };
  source: LoginMappingSource;
};

export type TSshHost = {
  id: string;
  projectId: string;
  hostname: string;
  alias: string | null;
  userCertTtl: string;
  hostCertTtl: string;
  loginMappings: TLoginMapping[];
};

export type TCreateSshHostDTO = {
  projectId: string;
  hostname: string;
  alias?: string;
  userCertTtl?: string;
  hostCertTtl?: string;
  loginMappings: Omit<TLoginMapping, "source">[];
};

export type TUpdateSshHostDTO = {
  sshHostId: string;
  hostname?: string;
  alias?: string;
  userCertTtl?: string;
  hostCertTtl?: string;
  loginMappings?: Omit<TLoginMapping, "source">[];
};

export type TDeleteSshHostDTO = {
  sshHostId: string;
};
