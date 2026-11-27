import { TGatewaysV2 } from "@app/db/schemas";
import { TActorContext } from "@app/domains/lib/actor-context";
import { TActorInput } from "@app/lib/types";

// One retry past the first attempt. Higher multiplies load onto whichever members are still up,
// which is the flood this is meant to avoid.
export const DEFAULT_POOL_FAILOVER_ATTEMPTS = 2;

export type TCreateGatewayPoolDTO = {
  name: string;
} & TActorInput;

export type TListGatewayPoolsDTO = TActorContext;

export type TGetGatewayPoolByIdDTO = {
  poolId: string;
} & TActorInput;

export type TUpdateGatewayPoolDTO = {
  poolId: string;
  name?: string;
} & TActorInput;

export type TDeleteGatewayPoolDTO = {
  poolId: string;
} & TActorInput;

export type TAddGatewayToPoolDTO = {
  poolId: string;
  gatewayId: string;
} & TActorInput;

export type TRemoveGatewayFromPoolDTO = {
  poolId: string;
  gatewayId: string;
} & TActorInput;

export type TGatewayPoolMemberFilter = (gateway: TGatewaysV2) => boolean;

export type TGetPlatformConnectionDetailsByPoolIdDTO = {
  poolId: string;
  targetHost: string;
  targetPort: number;
};

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
