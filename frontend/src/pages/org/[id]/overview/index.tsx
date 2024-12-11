import { useOrganization } from "@app/context";
import { useRouter } from "next/router";
import { useEffect } from "react";

// #TODO: Update all the workspaceIds
const OrganizationPage = () => {
  const router = useRouter();
  const { currentOrg } = useOrganization();
  useEffect(() => {
    if (router.isReady && currentOrg?.id) {
      router.push(`/org/${currentOrg?.id}/secret-manager/overview`);
    }
  }, [router.isReady, currentOrg?.id]);

  return <div />;
};

Object.assign(OrganizationPage, { requireAuth: true });

export default OrganizationPage;
