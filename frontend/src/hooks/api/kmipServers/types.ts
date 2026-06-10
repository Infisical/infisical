import { CertKeyAlgorithm } from "@app/hooks/api/certificates/enums";

export type TKmipServerAuthMethodView =
  | {
      method: "aws";
      config: {
        id: string;
        stsEndpoint: string;
        allowedPrincipalArns: string;
        allowedAccountIds: string;
        createdAt: string;
        updatedAt: string;
      };
    }
  | {
      method: "token";
      config: Record<string, never>;
    }
  | {
      method: "identity";
      config: { identityId: string; identityName: string | null };
    };

export type TKmipServer = {
  id: string;
  createdAt: string;
  updatedAt: string;
  orgId: string;
  name: string;
  hostnamesOrIps: string | null;
  ttl: string | null;
  keyAlgorithm: string | null;
};

export type TKmipServerWithAuthMethod = TKmipServer & {
  canRevoke: boolean;
  authMethod: TKmipServerAuthMethodView;
};

export type TDeleteKmipServerDTO = {
  kmipServerId: string;
};

export type TCreateKmipServerDTO = {
  name: string;
  hostnamesOrIps: string;
  ttl?: string;
  keyAlgorithm?: CertKeyAlgorithm;
  authMethod:
    | {
        method: "aws";
        stsEndpoint: string;
        allowedPrincipalArns: string;
        allowedAccountIds: string;
      }
    | { method: "token" };
};

export type TUpdateKmipServerDTO = {
  kmipServerId: string;
  hostnamesOrIps?: string;
  ttl?: string;
  keyAlgorithm?: CertKeyAlgorithm;
  authMethod?:
    | {
        method: "aws";
        stsEndpoint: string;
        allowedPrincipalArns: string;
        allowedAccountIds: string;
      }
    | { method: "token" };
};

export type TGenerateKmipServerEnrollmentTokenDTO = {
  kmipServerId: string;
};

export type TRevokeKmipServerAccessDTO = {
  kmipServerId: string;
};
