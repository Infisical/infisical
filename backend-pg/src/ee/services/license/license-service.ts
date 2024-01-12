import axios from "axios";

import { getConfig } from "@app/lib/config/env";

import { TLicenseDalFactory } from "./license-dal";

type TLicenseServiceFactoryDep = {
  licenseDal: TLicenseDalFactory;
};

export type TLicenseServiceFactory = ReturnType<typeof licenseServiceFactory>;

export const licenseServiceFactory = ({ licenseDal }: TLicenseServiceFactoryDep) => {
  const appCfg = getConfig();
  const licenceApi = axios.create({
    baseURL: appCfg.LICENCE_SERVER_URL
  });

  const generateOrgCustomerId = async (orgName: string, email: string) => {
    const {
      data: { customerId }
    } = await licenceApi.post("/api/license-server/v1/customers", { email, name: orgName });
    return customerId;
  };

  const removeOrgCustomer = async (customerId: string) => {
    await licenceApi.delete(`/api/license-server/v1/customers/${customerId}`);
  };

  return {
    generateOrgCustomerId,
    removeOrgCustomer
  };
};
