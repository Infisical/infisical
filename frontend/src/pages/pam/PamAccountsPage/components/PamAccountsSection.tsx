import { ContentLoader } from "@app/components/v2";
import { useProject } from "@app/context";
import { useListPamAccounts } from "@app/hooks/api/pam";

import { PamAccountsTable } from "./PamAccountsTable";

export const PamAccountsSection = () => {
  const { currentProject } = useProject();

  const { data, isPending } = useListPamAccounts(currentProject.id, {
    refetchInterval: 30000
  });

  if (isPending) return <ContentLoader />;

  return (
    <PamAccountsTable
      projectId={currentProject.id}
      accounts={data?.accounts || []}
      folders={data?.folders || []}
    />
  );
};
