import { Card, CardDescription, CardHeader, CardTitle } from "@app/components/v3";

const FOLDER_ACCESS_DOCS_URL =
  "https://infisical.com/docs/documentation/platform/access-controls/folder-rbac";

export const AdditionalPrivilegesRemovedSection = () => {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Additional Privileges Moved to Folder-Level Access</CardTitle>
        <CardDescription>
          Folder-level grants override roles and keep working when folders are renamed or moved.{" "}
          <a
            href={FOLDER_ACCESS_DOCS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 hover:text-foreground"
          >
            Learn more
          </a>
          .
        </CardDescription>
      </CardHeader>
    </Card>
  );
};
