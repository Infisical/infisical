import { OrgServiceActor } from "@app/lib/types";

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

export type TGetPlatformConnectionDetailsByPoolIdDTO = {
  poolId: string;
  targetHost: string;
  targetPort: number;
};
