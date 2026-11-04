import { OrgServiceActor } from "@app/lib/types";
import { TAppConnectionDALFactory } from "@app/services/app-connection/app-connection-dal";
import { TAppConnectionServiceFactory } from "@app/services/app-connection/app-connection-service";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";

import {
  THoneyTokenConfigRecord,
  THoneyTokenConfigWithDecrypted
} from "../honey-token/aws/honey-token-aws-config-types";
import { HoneyTokenType } from "../honey-token/honey-token-enums";
import {
  THoneyTokenConfigByType,
  THoneyTokenTestConnectionResponseByType
} from "../honey-token/honey-token-provider-types";
import { TLicenseServiceFactory } from "../license/license-service";
import { TPermissionServiceFactory } from "../permission/permission-service-types";
import { THoneyTokenConfigDALFactory } from "./honey-token-config-dal";

export type THoneyTokenConfigServiceFactoryDep = {
  honeyTokenConfigDAL: THoneyTokenConfigDALFactory;
  permissionService: Pick<TPermissionServiceFactory, "getOrgPermission">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
  appConnectionDAL: Pick<TAppConnectionDALFactory, "findById">;
  appConnectionService: Pick<TAppConnectionServiceFactory, "validateAppConnectionUsageById">;
};

export type THoneyTokenConfigProviderUpsertInput<T extends HoneyTokenType = HoneyTokenType> = {
  orgId: string;
  connectionId: string;
  config: THoneyTokenConfigByType[T];
};

export type THoneyTokenConfigProviderTestConnectionInput = {
  orgId: string;
};

export type THoneyTokenConfigProviderGetConfigInput = {
  orgId: string;
};

export type THoneyTokenConfigProvider<T extends HoneyTokenType = HoneyTokenType> = {
  upsertConfig: (input: THoneyTokenConfigProviderUpsertInput<T>) => Promise<THoneyTokenConfigRecord>;
  testConnection: (
    input: THoneyTokenConfigProviderTestConnectionInput
  ) => Promise<THoneyTokenTestConnectionResponseByType[T]>;
  getConfig: (input: THoneyTokenConfigProviderGetConfigInput) => Promise<THoneyTokenConfigWithDecrypted | undefined>;
};

export type THoneyTokenConfigServiceUpsertInput<T extends HoneyTokenType = HoneyTokenType> = {
  orgPermission: OrgServiceActor;
  type: T;
  connectionId: string;
  config: THoneyTokenConfigByType[T];
};

export type THoneyTokenConfigServiceTypeInput<T extends HoneyTokenType = HoneyTokenType> = {
  orgPermission: OrgServiceActor;
  type: T;
};
