export type TSqlCredentialsRotationProperties = {
  parameters: {
    username1: string;
    username2: string;
  };
  secretsMapping: {
    username: string;
    password: string;
  };
};

export type TSqlOptionTemplate = {
  secretsMapping: TSqlCredentialsRotationProperties["secretsMapping"];
  createUserStatement: string;
};

export type TSqlCredentialsRotationGeneratedCredentials = {
  username: string;
  password: string;
};
