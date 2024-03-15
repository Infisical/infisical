import { TOrgDALFactory } from "@app/services/org/org-dal";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { TProjectMembershipDALFactory } from "@app/services/project-membership/project-membership-dal";

type TDeleteOrgMembership = {
  orgMembershipId: string;
  orgId: string;
  orgDAL: Pick<TOrgDALFactory, "findMembership" | "deleteMembershipById" | "transaction">;
  projectDAL: Pick<TProjectDALFactory, "find">;
  projectMembershipDAL: Pick<TProjectMembershipDALFactory, "find" | "delete">;
};

export const deleteOrgMembership = async ({
  orgMembershipId,
  orgId,
  orgDAL,
  projectDAL,
  projectMembershipDAL
}: TDeleteOrgMembership) => {
  const membership = await orgDAL.transaction(async (tx) => {
    // delete org membership
    const orgMembership = await orgDAL.deleteMembershipById(orgMembershipId, orgId, tx);

    const projects = await projectDAL.find({ orgId }, { tx });

    // delete associated project memberships
    await projectMembershipDAL.delete(
      {
        $in: {
          projectId: projects.map((project) => project.id)
        },
        userId: orgMembership.userId as string
      },
      tx
    );

    return orgMembership;
  });

  return membership;
};
