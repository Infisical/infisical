import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useRouter } from "next/router";

import { useOrganization, useWorkspace } from "@app/context";
import { useGetUserWsKey } from "@app/hooks/api";

export const SecretOverviewPage = () => {
  const { t } = useTranslation();
  const router = useRouter();

  const { currentWorkspace, isLoading } = useWorkspace();
  const { currentOrg } = useOrganization();
  const workspaceId = currentWorkspace?._id as string;
  const { data: latestFileKey } = useGetUserWsKey(workspaceId);
  const [searchFilter, setSearchFilter] = useState("");
  const secretPath = router.query?.secretPath as string;
  return <div>Secret overview page</div>;
};
