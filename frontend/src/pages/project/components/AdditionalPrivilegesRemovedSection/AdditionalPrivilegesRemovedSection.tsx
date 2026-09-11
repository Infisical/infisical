import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  DocumentationLinkBadge,
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle
} from "@app/components/v3";
import { usePopUp } from "@app/hooks";

const FOLDER_ACCESS_DOCS_URL =
  "https://infisical.com/docs/documentation/platform/access-controls/folder-rbac";

const UPGRADE_TEXT =
  "Folder-level access controls can be unlocked if you upgrade to Infisical Pro plan.";

export const AdditionalPrivilegesRemovedSection = () => {
  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp(["upgradePlan"] as const);

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>
            Additional Privileges
            <DocumentationLinkBadge href={FOLDER_ACCESS_DOCS_URL} />
          </CardTitle>
          <CardDescription>
            One-off policies are no longer available on this project.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Empty className="border">
            <EmptyHeader>
              <EmptyTitle>Folder Access Replaces Additional Privileges</EmptyTitle>
              <EmptyDescription>
                Additional privileges have been replaced by project roles and folder access. Folder
                access is scoped to a path and everything under it, at a tier from List to Full
                Access, and can expire. Your plan does not include folder access.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button variant="project" onClick={() => handlePopUpOpen("upgradePlan")}>
                Upgrade Plan
              </Button>
            </EmptyContent>
          </Empty>
        </CardContent>
      </Card>
      <UpgradePlanModal
        isOpen={popUp.upgradePlan.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("upgradePlan", isOpen)}
        text={UPGRADE_TEXT}
      />
    </>
  );
};
