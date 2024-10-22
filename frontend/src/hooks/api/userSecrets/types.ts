import { TCreateSecretsV3DTO, TGetProjectSecretsKey } from "../secrets/types";

export enum UserSecretType {
  Login = "Login"
}

export interface BaseUserSecret {
  tags: string[];
  notes: string;
}

export interface LoginUserSecret extends BaseUserSecret {
  type: UserSecretType.Login;
  username: string;
  password: string;
  websites: string[];
}

export type TCreateUserSecretsV3DTO = Omit<
  TCreateSecretsV3DTO,
  "skipMultilineEncoding" | "type"
> & {
  type: UserSecretType;
};

export type TGetUserSecretsKey = Pick<TGetProjectSecretsKey, "workspaceId" | "environment">;

export type TGetUserSecretsDTO = TGetUserSecretsKey;
