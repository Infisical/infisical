export type TSyncSecretReplicationDTO = {
  id: string;
};

export type TSecretReplicationServiceFactory = {
  init: () => Promise<void>;
};
