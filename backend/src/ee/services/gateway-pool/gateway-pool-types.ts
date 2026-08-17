import { TGatewaysV2 } from "@app/db/schemas";
import { OrgServiceActor } from "@app/lib/types";

// One retry past the first attempt. Higher multiplies load onto whichever members are still up,
// which is the flood this is meant to avoid.
export const DEFAULT_POOL_FAILOVER_ATTEMPTS = 2;

export type TCreateGatewayPoolDTO = {
  name: string;
} & OrgServiceActor;

export type TListGatewayPoolsDTO = OrgServiceActor;

export type TGetGatewayPoolByIdDTO = {
  poolId: string;
} & OrgServiceActor;

export type TUpdateGatewayPoolDTO = {
  poolId: string;
  name?: string;
} & OrgServiceActor;

export type TDeleteGatewayPoolDTO = {
  poolId: string;
} & OrgServiceActor;

export type TAddGatewayToPoolDTO = {
  poolId: string;
  gatewayId: string;
} & OrgServiceActor;

export type TRemoveGatewayFromPoolDTO = {
  poolId: string;
  gatewayId: string;
} & OrgServiceActor;

export type TGatewayPoolMemberFilter = (gateway: TGatewaysV2) => boolean;

export type TSelectGatewayFromPoolDTO = {
  poolId: string;
  exclude?: Set<string>;
  filter?: TGatewayPoolMemberFilter;
  unavailableMessage?: string;
};

export type TRunWithPoolFailoverDTO = {
  poolId?: string | null;
  gatewayId?: string | null;
  filter?: TGatewayPoolMemberFilter;
  maxAttempts?: number;
  unavailableMessage?: string;
};
