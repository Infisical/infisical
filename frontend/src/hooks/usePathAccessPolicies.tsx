import { useMemo } from "react";

import { useProject, useSubscription } from "@app/context";
import { removeTrailingSlash } from "@app/helpers/string";
import { useGetAccessApprovalPolicies } from "@app/hooks/api";
import { isGlobSubsetOfGlob } from "@app/lib/fn/glob";

type Params = {
  secretPath: string;
  environment: string;
};

export const usePathAccessPolicies = ({ secretPath, environment }: Params) => {
  const { currentProject } = useProject();
  const { subscription } = useSubscription();
  const { data: policies } = useGetAccessApprovalPolicies({
    projectSlug: currentProject.slug,
    options: {
      enabled: subscription.secretApproval
    }
  });

  return useMemo(() => {
    const pathPolicies = policies?.filter(
      (policy) =>
        policy.environments?.some((env) => env.slug === environment) &&
        isGlobSubsetOfGlob(policy.secretPath, removeTrailingSlash(secretPath))
    );

    return {
      hasPathPolicies: subscription.secretApproval && Boolean(pathPolicies?.length),
      pathPolicies,
      policies: policies ?? []
    };
  }, [secretPath, environment, policies, subscription.secretApproval]);
};
