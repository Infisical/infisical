import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  DocumentationLinkBadge
} from "@app/components/v3";

const FOLDER_ACCESS_DOCS_URL =
  "https://infisical.com/docs/documentation/platform/access-controls/folder-rbac";

export const AdditionalPrivilegesRemovedSection = () => {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          Additional Privileges Moved to Folder-Level Access
          <DocumentationLinkBadge href={FOLDER_ACCESS_DOCS_URL} />
        </CardTitle>
        <CardDescription>
          Folder-level grants override roles and keep working when folders are renamed or moved.
        </CardDescription>
      </CardHeader>
    </Card>
  );
};
