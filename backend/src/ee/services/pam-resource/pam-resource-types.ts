import { TGatewayV2ServiceFactory } from "../gateway-v2/gateway-v2-service";
import { PamResource } from "./pam-resource-enums";
import {
  TPostgresAccount,
  TPostgresAccountCredentials,
  TPostgresResource,
  TPostgresResourceConnectionDetails
} from "./postgres/postgres-resource-types";

// Resource types
export type TPamResource = TPostgresResource;
export type TPamResourceConnectionDetails = TPostgresResourceConnectionDetails;

// Account types
export type TPamAccount = TPostgresAccount;
export type TPamAccountCredentials = TPostgresAccountCredentials;

// Resource DTOs
export type TCreateResourceDTO = Pick<
  TPamResource,
  "name" | "connectionDetails" | "resourceType" | "gatewayId" | "projectId" | "rotationAccountCredentials"
>;

export type TUpdateResourceDTO = Partial<Omit<TCreateResourceDTO, "resourceType" | "projectId">> & {
  resourceId: string;
};

// Resource factory
export type TPamResourceFactoryValidateConnection<T extends TPamResourceConnectionDetails> = () => Promise<T>;
export type TPamResourceFactoryValidateAccountCredentials<C extends TPamAccountCredentials> = (
  credentials: C
) => Promise<C>;
export type TPamResourceFactoryRotateAccountCredentials<C extends TPamAccountCredentials> = (
  rotationAccountCredentials: C,
  currentCredentials: C
) => Promise<C>;

export type TPamResourceFactory<T extends TPamResourceConnectionDetails, C extends TPamAccountCredentials> = (
  resourceType: PamResource,
  connectionDetails: T,
  gatewayId: string,
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">
) => {
  validateConnection: TPamResourceFactoryValidateConnection<T>;
  validateAccountCredentials: TPamResourceFactoryValidateAccountCredentials<C>;
  rotateAccountCredentials: TPamResourceFactoryRotateAccountCredentials<C>;
};
