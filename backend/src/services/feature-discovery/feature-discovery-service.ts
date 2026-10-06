import { TFeatureDiscoveryDALFactory } from "./feature-discovery-dal";

type TFeatureDiscoveryServiceFactoryDep = {
  featureDiscoveryDAL: Pick<TFeatureDiscoveryDALFactory, "find" | "insertIgnoringDuplicates">;
};

export type TFeatureDiscoveryServiceFactory = ReturnType<typeof featureDiscoveryServiceFactory>;

export const featureDiscoveryServiceFactory = ({ featureDiscoveryDAL }: TFeatureDiscoveryServiceFactoryDep) => {
  const listFeatureDiscoveries = async (userId: string) => {
    const discoveries = await featureDiscoveryDAL.find({ userId });
    return discoveries.map(({ releaseId, createdAt }) => ({ releaseId, createdAt }));
  };

  const createFeatureDiscoveries = async (userId: string, releaseIds: string[]) => {
    await featureDiscoveryDAL.insertIgnoringDuplicates(userId, [...new Set(releaseIds)]);
    return listFeatureDiscoveries(userId);
  };

  return { listFeatureDiscoveries, createFeatureDiscoveries };
};
