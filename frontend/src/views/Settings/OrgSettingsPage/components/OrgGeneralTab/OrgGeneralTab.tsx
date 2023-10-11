import { useOrganization, useUser } from "@app/context";
import { useGetOrgUsers } from "@app/hooks/api";

import { OrgDeleteSection } from "../OrgDeleteSection";
import { OrgIncidentContactsSection } from "../OrgIncidentContactsSection";
import { OrgNameChangeSection } from "../OrgNameChangeSection";

export const OrgGeneralTab = () => {
  const { currentOrg } = useOrganization();
  const { user } = useUser();
  const { data: members } = useGetOrgUsers(currentOrg?._id ?? "");

  const membershipOrg = members?.find((member) => member.user._id === user._id);

  return (
    <div>
      <OrgNameChangeSection />
      <OrgIncidentContactsSection />
      {(membershipOrg && membershipOrg.role === "admin") && (
        <OrgDeleteSection />
      )}
    </div>
  );
};
