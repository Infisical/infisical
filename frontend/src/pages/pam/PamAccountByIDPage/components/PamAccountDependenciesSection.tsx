import type { TPamAccount } from "@app/hooks/api/pam";
import { useGetPamAccountDependencies } from "@app/hooks/api/pam";

import { PamDependenciesTable } from "../../components/PamDependenciesTable";

export const PamAccountDependenciesSection = ({ account }: { account: TPamAccount }) => {
  const { data: dependencies, isPending } = useGetPamAccountDependencies(account.id);

  return (
    <PamDependenciesTable
      dependencies={dependencies}
      isPending={isPending}
      contextColumnLabel="Resource"
      getContextValue={(dep) => dep.resourceName}
    />
  );
};
