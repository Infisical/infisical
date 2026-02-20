import { TGatewayV2DALFactory } from "@app/ee/services/gateway-v2/gateway-v2-dal";
import { TGatewayV2ServiceFactory } from "@app/ee/services/gateway-v2/gateway-v2-service";
import { TPamAccountDALFactory } from "@app/ee/services/pam-account/pam-account-dal";
import { activeDirectoryDiscoveryFactory } from "@app/ee/services/pam-discovery/active-directory/active-directory-discovery-factory";
import { TPamAccountDependenciesDALFactory } from "@app/ee/services/pam-discovery/pam-account-dependencies-dal";
import { PamDiscoveryType } from "@app/ee/services/pam-discovery/pam-discovery-enums";
import { TPamDiscoveryRunDALFactory } from "@app/ee/services/pam-discovery/pam-discovery-run-dal";
import { TPamDiscoverySourceAccountsDALFactory } from "@app/ee/services/pam-discovery/pam-discovery-source-accounts-dal";
import { TPamDiscoverySourceDALFactory } from "@app/ee/services/pam-discovery/pam-discovery-source-dal";
import { TPamDiscoverySourceDependenciesDALFactory } from "@app/ee/services/pam-discovery/pam-discovery-source-dependencies-dal";
import { TPamDiscoverySourceResourcesDALFactory } from "@app/ee/services/pam-discovery/pam-discovery-source-resources-dal";
import {
  TPamDiscoveryConfiguration,
  TPamDiscoveryCredentials,
  TPamDiscoveryFactory
} from "@app/ee/services/pam-discovery/pam-discovery-types";
import { TPamResourceDALFactory } from "@app/ee/services/pam-resource/pam-resource-dal";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";

export type TPamDiscoveryScanDeps = {
  pamDiscoverySourceDAL: Pick<TPamDiscoverySourceDALFactory, "findById" | "updateById">;
  pamDiscoveryRunDAL: Pick<TPamDiscoveryRunDALFactory, "create" | "updateById">;
  pamDiscoverySourceResourcesDAL: Pick<TPamDiscoverySourceResourcesDALFactory, "upsertJunction" | "markStaleForRun">;
  pamDiscoverySourceAccountsDAL: Pick<TPamDiscoverySourceAccountsDALFactory, "upsertJunction" | "markStaleForRun">;
  pamDiscoverySourceDependenciesDAL: Pick<
    TPamDiscoverySourceDependenciesDALFactory,
    "upsertJunction" | "markStaleForRun"
  >;
  pamAccountDependenciesDAL: Pick<TPamAccountDependenciesDALFactory, "upsertDependency">;
  pamResourceDAL: Pick<TPamResourceDALFactory, "create" | "find" | "findById">;
  pamAccountDAL: Pick<TPamAccountDALFactory, "create" | "find">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">;
  gatewayV2DAL: Pick<TGatewayV2DALFactory, "findById">;
};

type TPamDiscoveryFactoryImplementation = TPamDiscoveryFactory<TPamDiscoveryConfiguration, TPamDiscoveryCredentials>;

export const PAM_DISCOVERY_FACTORY_MAP: Record<PamDiscoveryType, TPamDiscoveryFactoryImplementation> = {
  [PamDiscoveryType.ActiveDirectory]: activeDirectoryDiscoveryFactory as TPamDiscoveryFactoryImplementation
};
