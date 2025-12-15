import { useMemo } from "react";

import { useProject, useSubscription } from "@app/context";
import { useGetAccessApprovalPolicies } from "@app/hooks/api";
import { SubscriptionProductCategory } from "@app/hooks/api/subscriptions/types";

const matchesPath = (folderPath: string, pattern: string) => {
  const normalizedPath = folderPath === "/" ? "/" : folderPath.replace(/\/$/, "");
  const normalizedPattern = pattern === "/" ? "/" : pattern.replace(/\/$/, "");

  if (normalizedPath === normalizedPattern) {
    return true;
  }

  if (normalizedPattern.endsWith("/**")) {
    const basePattern = normalizedPattern.slice(0, -3); // Remove "/**"

    // Handle root wildcard "/**"
    if (basePattern === "") {
      return true;
    }

    // Check if path starts with the base pattern
    if (normalizedPath === basePattern) {
      return true;
    }

    // Check if path is a subdirectory of the base pattern
    return normalizedPath.startsWith(`${basePattern}/`);
  }

  return false;
};

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
      enabled: subscription.get(SubscriptionProductCategory.SecretManager, "secretApproval")
    }
  });

  return useMemo(() => {
    const pathPolicies = policies?.filter(
      (policy) =>
        policy.environments?.some((env) => env.slug === environment) &&
        matchesPath(secretPath, policy.secretPath)
    );

    return {
      hasPathPolicies:
        subscription.get(SubscriptionProductCategory.SecretManager, "secretApproval") &&
        Boolean(pathPolicies?.length),
      pathPolicies
    };
  }, [
    secretPath,
    environment,
    policies,
    subscription.get(SubscriptionProductCategory.SecretManager, "secretApproval")
  ]);
};
