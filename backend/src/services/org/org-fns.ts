import { TOrgDALFactory } from "@app/services/org/org-dal";

type TDeleteOrgMembership = {
  orgMembershipId: string;
  orgId: string;
  orgDAL: TOrgDALFactory;
};

export const deleteOrgMembership = async ({ orgMembershipId, orgId, orgDAL }: TDeleteOrgMembership) => {
  // TODO: improve this implementation

  // delete
  const m2 = await orgDAL.transaction(async (tx) => {
    const m1 = await orgDAL.deleteMembershipById(orgMembershipId, orgId, tx);
    // const [deletedMembership] = await projectMembershipDAL.delete({ projectId, id: membershipId }, tx);
    // delete project memberships
    return m1;
  });

  return m2;
};
