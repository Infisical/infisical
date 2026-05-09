import { OrgServiceActor } from "@app/lib/types";

import { ResourceAuthMethodType, ResourceRef } from "./resource-auth-method-fns";

export type TAwsAuthMethodConfig = {
  stsEndpoint: string;
  allowedPrincipalArns: string;
  allowedAccountIds: string;
};

export type TSetAuthMethodInput =
  | ({ method: typeof ResourceAuthMethodType.Aws } & TAwsAuthMethodConfig)
  | { method: typeof ResourceAuthMethodType.Token };

export type TSetAuthMethodDTO = {
  resource: ResourceRef;
  authMethod: TSetAuthMethodInput;
  actor: OrgServiceActor;
};

export type TGetAuthMethodDTO = {
  resource: ResourceRef;
  actor: OrgServiceActor;
};

export type TMintTokenDTO = TGetAuthMethodDTO;
export type TRevokeTokenDTO = TGetAuthMethodDTO;

export type TLoginWithAwsDTO = {
  resource: ResourceRef;
  iamHttpRequestMethod: string;
  iamRequestBody: string;
  iamRequestHeaders: string;
};

export type TLoginWithTokenDTO = {
  token: string;
};

export type TAuthMethodView =
  | {
      method: typeof ResourceAuthMethodType.Aws;
      config: TAwsAuthMethodConfig & { id: string; createdAt: Date; updatedAt: Date };
    }
  | {
      method: typeof ResourceAuthMethodType.Token;
      config: Record<string, never>;
    }
  | {
      method: typeof ResourceAuthMethodType.Identity;
      config: { identityId: string; identityName: string | null };
    };
