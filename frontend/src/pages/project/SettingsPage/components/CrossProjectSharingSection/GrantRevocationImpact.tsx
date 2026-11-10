import { TriangleAlertIcon } from "lucide-react";

import { Alert, AlertDescription } from "@app/components/v3";

type Props = {
  usage: { isChecking: boolean; isError: boolean; total: number };
  targetProjectName?: string;
  folderCount: number;
};

export const GrantRevocationImpact = ({ usage, targetProjectName, folderCount }: Props) => {
  const folders = folderCount === 1 ? "this folder" : "these folders";
  const projectName = targetProjectName ?? "the other project";

  if (usage.isChecking) {
    return (
      <p className="text-sm text-label">
        Checking for secret imports and references that use {folders}...
      </p>
    );
  }

  if (!usage.isError && usage.total === 0) {
    return (
      <p className="text-sm text-label">
        No secret imports or references in {projectName} use {folders}.
      </p>
    );
  }

  return (
    <Alert variant="warning">
      <TriangleAlertIcon />
      <AlertDescription>
        {usage.isError ? (
          <>
            Usage could not be checked. Secret imports and references in {projectName} that use{" "}
            {folders} will stop resolving
          </>
        ) : (
          <>
            {usage.total}{" "}
            {usage.total === 1 ? "secret import or reference" : "secret imports and references"} in{" "}
            {projectName} {usage.total === 1 ? "uses" : "use"} {folders} and will stop resolving
          </>
        )}
        , which can break secret syncs and other integrations that depend on them.
      </AlertDescription>
    </Alert>
  );
};
