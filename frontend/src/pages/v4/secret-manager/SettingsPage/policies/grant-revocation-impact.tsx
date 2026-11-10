import { Alert } from "@app/components/v4/ui/alert";
import { Text } from "@app/components/v4/ui/text";

import type { FolderGrantsUsage } from "../../../data/secret-policies/contract";

export const GrantRevocationImpact = ({
  usage,
  targetProjectName = "the other project",
  folderCount
}: {
  usage: FolderGrantsUsage;
  targetProjectName?: string;
  folderCount: number;
}) => {
  const folders = folderCount === 1 ? "this folder" : "these folders";
  if (usage.isChecking) {
    return <Text muted>Checking for secret imports and references that use {folders}...</Text>;
  }
  if (!usage.isError && usage.total === 0) {
    return (
      <Text muted>
        No secret imports or references in {targetProjectName} use {folders}.
      </Text>
    );
  }
  const references =
    usage.total === 1 ? "secret import or reference" : "secret imports and references";
  return (
    <Alert tone="warn">
      {usage.isError
        ? `Usage could not be checked. Secret imports and references in ${targetProjectName} that use ${folders} will stop resolving`
        : `${usage.total} ${references} in ${targetProjectName} ${usage.total === 1 ? "uses" : "use"} ${folders} and will stop resolving`}
      , which can break secret syncs and other integrations that depend on them.
    </Alert>
  );
};
