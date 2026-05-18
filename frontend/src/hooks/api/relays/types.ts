export type TRelayAuthMethodView =
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

export type TRelay = {
  id: string;
  createdAt: string;
  updatedAt: string;
  orgId: string | null;
  identityId: string | null;
  name: string;
  host: string;
  heartbeat: string;
};

export type TRelayWithAuthMethod = TRelay & {
  canRevoke: boolean;
  authMethod: TRelayAuthMethodView;
};

export type TDeleteRelayDTO = {
  id: string;
};

export type TCreateRelayDTO = {
  name: string;
  host: string;
  authMethod:
    | {
        method: "aws";
        stsEndpoint: string;
        allowedPrincipalArns: string;
        allowedAccountIds: string;
      }
    | { method: "token" };
};

export type TUpdateRelayAuthMethodDTO = {
  relayId: string;
  authMethod:
    | {
        method: "aws";
        stsEndpoint: string;
        allowedPrincipalArns: string;
        allowedAccountIds: string;
      }
    | { method: "token" };
};

export type TGenerateRelayEnrollmentTokenDTO = {
  relayId: string;
};

export type TRevokeRelayAccessDTO = {
  relayId: string;
};
