import { TFeatureDiscoveryDALFactory } from "./feature-discovery-dal";

type TFeatureDiscoveryServiceFactoryDep = {
  featureDiscoveryDAL: Pick<TFeatureDiscoveryDALFactory, "find" | "insertIgnoringDuplicates" | "transaction">;
};

export type TFeatureDiscoveryServiceFactory = ReturnType<typeof featureDiscoveryServiceFactory>;

export const featureDiscoveryServiceFactory = ({ featureDiscoveryDAL }: TFeatureDiscoveryServiceFactoryDep) => {
  const listFeatureDiscoveries = async (userId: string) => {
    const discoveries = await featureDiscoveryDAL.find({ userId });
    return discoveries.map(({ releaseId, createdAt }) => ({ releaseId, createdAt }));
  };

  const createFeatureDiscoveries = async (userId: string, releaseIds: string[]) => {
    const discoveries = await featureDiscoveryDAL.transaction(async (tx) => {
      await featureDiscoveryDAL.insertIgnoringDuplicates(userId, [...new Set(releaseIds)], tx);
      return featureDiscoveryDAL.find({ userId }, { tx });
    });
    return discoveries.map(({ releaseId, createdAt }) => ({ releaseId, createdAt }));
  };

  return { listFeatureDiscoveries, createFeatureDiscoveries };
};
