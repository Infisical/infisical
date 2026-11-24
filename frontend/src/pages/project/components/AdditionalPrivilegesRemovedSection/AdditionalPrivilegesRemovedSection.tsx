import { InfoIcon } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@app/components/v3";

const FOLDER_ACCESS_DOCS_URL =
  "https://infisical.com/docs/documentation/platform/access-controls/folder-rbac";

export const AdditionalPrivilegesRemovedSection = () => {
  return (
    <Alert variant="info">
      <InfoIcon />
      <AlertTitle>Additional Privileges Were Replaced by Folder-Level Access</AlertTitle>
      <AlertDescription>
        Folder-level access override roles and keep working when folders are renamed or moved.{" "}
        <a
          href={FOLDER_ACCESS_DOCS_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline underline hover:opacity-80"
        >
          Learn more
        </a>
      </AlertDescription>
    </Alert>
  );
};
