export type ActorIdentityAttributes = {
  name: string;
};

export type TDynamicSecretKubernetesLeaseConfig = {
  namespace?: string;
};

export type TDynamicSecretSshLeaseConfig = {
  principals?: string[];
};

export type TDynamicSecretLeaseConfig = TDynamicSecretKubernetesLeaseConfig & TDynamicSecretSshLeaseConfig;
