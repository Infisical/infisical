import { useEffect, useState } from "react";

import { Alert } from "@app/components/v4/ui/alert";
import { Button } from "@app/components/v4/ui/button";

import { useV4Adapter } from "../../../data/adapters";

const RESTRICTED = "Your role doesn't allow this";

export const BlindIndexAlert = ({
  projectId,
  isEnabled,
  canEnable
}: {
  projectId: string;
  isEnabled: boolean;
  canEnable: boolean;
}) => {
  const policies = useV4Adapter("secretPolicies");
  const enableBlindIndex = policies.useEnableBlindIndex();
  const { data: status } = policies.useBlindIndexStatus(projectId, { enabled: !isEnabled });
  const [wasTriggered, setWasTriggered] = useState(false);
  const [requestFailed, setRequestFailed] = useState(false);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (status?.status === "pending") setWasTriggered(true);
  }, [status?.status]);

  if (isEnabled) return null;

  const hasFailed = (status?.status === "failed" || requestFailed) && !pending;

  if (wasTriggered && !hasFailed) {
    return (
      <Alert tone="info">
        Indexing secrets so duplicate values can be detected. This may take a moment.
      </Alert>
    );
  }

  return (
    <Alert
      tone={hasFailed ? "bad" : "warn"}
      title={hasFailed ? "Could not index secrets" : "Secret indexing required"}
      actions={
        <Button
          type="button"
          variant="outline"
          size="xs"
          loading={pending}
          disabledReason={canEnable ? undefined : RESTRICTED}
          onClick={async () => {
            setWasTriggered(true);
            setRequestFailed(false);
            setPending(true);
            try {
              await enableBlindIndex.mutateAsync({ projectId });
            } catch {
              setRequestFailed(true);
            } finally {
              setPending(false);
            }
          }}
        >
          {hasFailed ? "Retry" : "Enable indexing"}
        </Button>
      }
    >
      {hasFailed
        ? (status?.message ?? "Unknown error")
        : "This constraint compares values through the project's secret index. Enable it to save the rule."}
    </Alert>
  );
};
