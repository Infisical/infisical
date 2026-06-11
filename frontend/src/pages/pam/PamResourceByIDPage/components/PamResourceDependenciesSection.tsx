// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck -- old PAM page, pending deletion in frontend cleanup
import type { TPamResource } from "@app/hooks/api/pam";
import { useGetPamResourceDependencies } from "@app/hooks/api/pam";

import { PamDependenciesTable } from "../../components/PamDependenciesTable";

export const PamResourceDependenciesSection = ({ resource }: { resource: TPamResource }) => {
  const { data: dependencies, isPending } = useGetPamResourceDependencies(
    resource.resourceType,
    resource.id
  );

  return (
    <PamDependenciesTable
      dependencies={dependencies}
      isPending={isPending}
      contextColumnLabel="Account"
      getContextValue={(dep) => dep.accountName}
    />
  );
};
