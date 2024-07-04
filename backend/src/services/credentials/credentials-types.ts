import { ActorAuthMethod, ActorType } from "../auth/auth-type";

// Expand these as we increase the available credentials
export enum CredentialLoginType {
  type = "Login",
  slug = "login"
}

export type CREDENTIAL = {
  type: CredentialLoginType.type;
  slug: CredentialLoginType.slug;
  username: string;
  password: string;
};

export type TCreateCredentialDTO = {
  actor: ActorType;
  actorAuthMethod: ActorAuthMethod;
  actorId: string;
  actorOrgId?: string;
  workspaceName: string;
  credentials: CREDENTIAL;
};
