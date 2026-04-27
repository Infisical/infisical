import type { TPamAccount } from "@app/hooks/api/pam";
import { useGetPamAccountDependencies } from "@app/hooks/api/pam";

import { PamDependenciesTable } from "../../components/PamDependenciesTable";

export const PamAccountDependenciesSection = ({ account }: { account: TPamAccount }) => {
  const { data: dependencies, isPending } = useGetPamAccountDependencies(account.id);

  return (
    <div>
      <h2 className="mb-4 text-xl font-semibold">Services & Tasks</h2>
      <PamDependenciesTable
        dependencies={dependencies}
        isPending={isPending}
        contextColumnLabel="Resource"
        getContextValue={(dep) => dep.resourceName}
      />
    </div>
  );
};
