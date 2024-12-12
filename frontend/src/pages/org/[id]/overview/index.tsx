import { useEffect } from "react";
import { useRouter } from "next/router";

import { useOrganization } from "@app/context";
import { ProjectType } from "@app/hooks/api/workspace/types";

// #TODO: Update all the workspaceIds
const OrganizationPage = () => {
  const router = useRouter();
  const { currentOrg } = useOrganization();
  useEffect(() => {
    if (router.isReady && currentOrg?.id) {
      router.push(`/org/${currentOrg?.id}/${ProjectType.SecretManager}/overview`);
    }
  }, [router.isReady, currentOrg?.id]);

  return <div />;
};

Object.assign(OrganizationPage, { requireAuth: true });

export default OrganizationPage;
