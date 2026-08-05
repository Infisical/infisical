import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";

import { TLicenseServiceFactory } from "../license/license-service";

type TProductInsightsServiceFactoryDep = {
  permissionService: Pick<TPermissionServiceFactory, "getOrgPermission">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
};

export type TProductInsightsServiceFactory = ReturnType<typeof productInsightsServiceFactory>;

export const productInsightsServiceFactory = (
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  { permissionService, licenseService }: TProductInsightsServiceFactoryDep
) => {
  return {};
};
