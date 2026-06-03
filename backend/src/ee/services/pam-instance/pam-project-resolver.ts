import { BadRequestError } from "@app/lib/errors";
import { TOrgDALFactory } from "@app/services/org/org-dal";

type TResolverDeps = {
  orgDAL: Pick<TOrgDALFactory, "findById">;
};

export type TPamProjectResolverFactory = ReturnType<typeof pamProjectResolverFactory>;

export const pamProjectResolverFactory = ({ orgDAL }: TResolverDeps) => ({
  resolve: async (actorOrgId: string): Promise<string> => {
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
});
