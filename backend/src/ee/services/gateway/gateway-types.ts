import { OrgServiceActor } from "@app/lib/types";
import { ActorAuthMethod } from "@app/services/auth/auth-type";

export type TExchangeAllocatedRelayAddressDTO = {
  identityId: string;
  identityOrg: string;
  identityOrgAuthMethod: ActorAuthMethod;
  relayAddress: string;
};

export type TListGatewaysDTO = {
  orgPermission: OrgServiceActor;
};

export type TGetGatewayByIdDTO = {
  id: string;
  orgPermission: OrgServiceActor;
};

export type TUpdateGatewayByIdDTO = {
  id: string;
  name?: string;
  orgPermission: OrgServiceActor;
};

export type TDeleteGatewayByIdDTO = {
  id: string;
  orgPermission: OrgServiceActor;
};

export type TGetProjectGatewayByIdDTO = {
  projectId: string;
  projectPermission: OrgServiceActor;
};

export type THeartBeatDTO = {
  orgPermission: OrgServiceActor;
};

export type TGatewayV1ConnectionDetails = {
  targetHost?: string;
  targetPort?: number;
  relayHost: string;
  relayPort: string | number;
  identityId: string;
  orgId: string;
      identityId: relayDetails.identityId,
      orgId: relayDetails.orgId,
      tlsOptions: {
        ca: relayDetails.certChain,
        cert: relayDetails.certificate,
        key: relayDetails.privateKey.toString()
      }
}