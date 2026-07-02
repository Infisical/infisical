import { ProjectType } from "@app/db/schemas";
import { KeyStorePrefixes, KeyStoreTtls, TKeyStoreFactory } from "@app/keystore/keystore";
import { withCache } from "@app/lib/cache/with-cache";
import { BadRequestError } from "@app/lib/errors";
import { TProjectDALFactory } from "@app/services/project/project-dal";

type TResolverDeps = {
  projectDAL: Pick<TProjectDALFactory, "find">;
  keyStore: Pick<TKeyStoreFactory, "getItem" | "setItemWithExpiry">;
};

export type TPamProjectResolverFactory = ReturnType<typeof pamProjectResolverFactory>;

export const pamProjectResolverFactory = ({ projectDAL, keyStore }: TResolverDeps) => ({
  resolve: (actorOrgId: string): Promise<string> =>
    withCache({
      keyStore,
      key: KeyStorePrefixes.PamDefaultProject(actorOrgId),
      ttlSeconds: KeyStoreTtls.PamDefaultProjectInSeconds,
      fetcher: async () => {
        const projects = await projectDAL.find(
          { orgId: actorOrgId, type: ProjectType.PAM },
          { sort: [["createdAt", "desc"]], limit: 1 }
        );
        if (projects.length === 0) {
          throw new BadRequestError({
            message: "This organization has no Privileged Access Manager project. Contact your administrator."
          });
        }
        return projects[0].id;
      }
    })
});
