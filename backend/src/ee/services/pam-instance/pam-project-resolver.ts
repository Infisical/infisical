import { KeyStorePrefixes, KeyStoreTtls, TKeyStoreFactory } from "@app/keystore/keystore";
import { withCache } from "@app/lib/cache/with-cache";
import { BadRequestError } from "@app/lib/errors";
import { TOrgDALFactory } from "@app/services/org/org-dal";

type TResolverDeps = {
  orgDAL: Pick<TOrgDALFactory, "findById">;
  keyStore: Pick<TKeyStoreFactory, "getItem" | "setItemWithExpiry" | "deleteItem">;
};

export type TPamProjectResolverFactory = ReturnType<typeof pamProjectResolverFactory>;

export const pamProjectResolverFactory = ({ orgDAL, keyStore }: TResolverDeps) => ({
  resolve: (actorOrgId: string): Promise<string> =>
    withCache({
      keyStore,
      key: KeyStorePrefixes.PamDefaultProject(actorOrgId),
      ttlSeconds: KeyStoreTtls.PamDefaultProjectInSeconds,
      fetcher: async () => {
        const org = await orgDAL.findById(actorOrgId);
        if (!org) {
          throw new BadRequestError({ message: "Organization not found." });
        }
        if (!org.defaultPamProjectId) {
          throw new BadRequestError({
            message: "This organization has no Access Management project. Contact your administrator."
          });
        }
        return org.defaultPamProjectId;
      }
    })
});
