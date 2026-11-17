import { useCallback, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { getPostHog } from "@app/components/analytics/posthog";
import { fetchSecretsActivationStatus, userActivationKeys } from "@app/hooks/api/userActivation";
import { resolveFeatureFlagVariant } from "@app/lib/analytics/experiments/resolveFeatureFlagVariant";

import type { ActivationVariant, SecretsActivationAdapter } from "./contract-activation";

export const secretsActivationLive: SecretsActivationAdapter = {
  useSecretsActivationCheck: () => {
    const queryClient = useQueryClient();
    return useCallback(
      async (orgId: string, userId: string) => {
        const queryKey = userActivationKeys.secretsStatus(orgId, userId);
        if (queryClient.getQueryData(queryKey) !== undefined) return false;
        const data = await queryClient.ensureQueryData({
          queryKey,
          queryFn: fetchSecretsActivationStatus,
          retry: false,
          gcTime: Infinity
        });
        return data.shouldShowActivation;
      },
      [queryClient]
    );
  },
  useActivationVariant: (enabled) => {
    const [resolved, setResolved] = useState<{ variant: ActivationVariant }>();
    useEffect(() => {
      if (!enabled || resolved) return undefined;
      return resolveFeatureFlagVariant<ActivationVariant>({
        client: getPostHog(),
        fallback: null,
        featureFlag: "secrets-activation-presentation",
        onResolved: (variant) => setResolved({ variant }),
        resolve: (value) => (value === "control" || value === "card" ? value : null),
        sendExposureEvent: false,
        timeoutMs: 3000
      });
    }, [enabled, resolved]);
    return { data: resolved?.variant, isPending: !resolved, error: null };
  }
};
