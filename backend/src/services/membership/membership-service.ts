import { TMembershipDALFactory } from "./membership-dal";

type TMembershipServiceFactoryDep = {
  membershipDAL: TMembershipDALFactory;
};

export type TMembershipServiceFactory = ReturnType<typeof membershipServiceFactory>;

export const membershipServiceFactory = ({ membershipDAL }: TMembershipServiceFactoryDep) => {
  return {};
};
