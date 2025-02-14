import { OrgServiceActor } from "@app/lib/types";

export type TExchangeAllocatedRelayAddressDTO = {
  identityId: string;
  identityOrg: string;
  relayAddress: string;
};

export type TListGatewaysDTO = {
  orgPermission: OrgServiceActor;
};

export type TGetGatewayByIdDTO = {
  id: string;
  orgPermission: OrgServiceActor;
};

export type TDeleteGatewayByIdDTO = {
  id: string;
  orgPermission: OrgServiceActor;
};
