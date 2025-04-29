export type TSshHostGroup = {
  id: string;
  projectId: string;
  name: string;
  loginMappings: {
    loginUser: string;
    allowedPrincipals: {
      usernames: string[];
    };
  }[];
};

export type TCreateSshHostGroupDTO = {
  projectId: string;
  name: string;
  loginMappings: {
    loginUser: string;
    allowedPrincipals: {
      usernames: string[];
    };
  }[];
};

export type TUpdateSshHostGroupDTO = {
  sshHostGroupId: string;
  name?: string;
  loginMappings?: {
    loginUser: string;
    allowedPrincipals: {
      usernames: string[];
    };
  }[];
};

export type TDeleteSshHostGroupDTO = {
  sshHostGroupId: string;
};
