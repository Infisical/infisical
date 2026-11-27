import { TriangleAlert } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@app/components/v3";
import { TSecretSyncRecursiveConflict } from "@app/hooks/api/secretSyncs";

const MAX_DISPLAYED_CONFLICTS = 5;

type Props = {
  conflicts: TSecretSyncRecursiveConflict[];
  description: string;
};

export const SecretSyncRecursiveConflictsAlert = ({ conflicts, description }: Props) => (
  <Alert variant="danger">
    <TriangleAlert />
    <AlertTitle>
      {conflicts.length === 1
        ? "1 secret name conflicts across folders"
        : `${conflicts.length} secret names conflict across folders`}
    </AlertTitle>
    <AlertDescription>
      <p>{description}</p>
      <ul className="mt-1 space-y-2">
        {conflicts.slice(0, MAX_DISPLAYED_CONFLICTS).map((conflict) => (
          <li key={conflict.key}>
            <span className="font-mono font-semibold">&quot;{conflict.key}&quot;</span> is used in{" "}
            {conflict.paths.length} folders:
            <ul className="mt-0.5 list-inside list-disc">
              {conflict.paths.map((path) => (
                <li key={path} className="font-mono">
                  {path}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
      {conflicts.length > MAX_DISPLAYED_CONFLICTS && (
        <p>and {conflicts.length - MAX_DISPLAYED_CONFLICTS} more</p>
      )}
    </AlertDescription>
  </Alert>
);
