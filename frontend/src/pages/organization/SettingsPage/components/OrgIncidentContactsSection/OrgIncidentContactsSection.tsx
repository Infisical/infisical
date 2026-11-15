import { Plus } from "lucide-react";

import { OrgPermissionCan, PermissionDeniedBanner } from "@app/components/permissions";
import {
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@app/components/v3";
import { OrgPermissionActions, OrgPermissionSubjects, useOrgPermission } from "@app/context";
import { usePopUp } from "@app/hooks";

import { AddOrgIncidentContactModal } from "./AddOrgIncidentContactModal";
import { OrgIncidentContactsTable } from "./OrgIncidentContactsTable";

export const OrgIncidentContactsSection = () => {
  const { handlePopUpToggle, popUp, handlePopUpOpen, handlePopUpClose } = usePopUp([
    "addContact"
  ] as const);
  const { permission } = useOrgPermission();

  return (
    <>
      <Card className="gap-0 overflow-hidden p-0">
        <CardHeader className="p-6">
          <CardTitle>Incident Contacts</CardTitle>
          <CardDescription>
            Contacts notified in the unlikely event of a severe incident.
          </CardDescription>
          <CardAction>
            <OrgPermissionCan
              I={OrgPermissionActions.Create}
              a={OrgPermissionSubjects.IncidentAccount}
            >
              {(isAllowed) => (
                <Button
                  variant="outline"
                  size="sm"
                  isDisabled={!isAllowed}
                  onClick={() => handlePopUpOpen("addContact")}
                >
                  <Plus />
                  Add Contact
                </Button>
              )}
            </OrgPermissionCan>
          </CardAction>
        </CardHeader>
        <CardContent className="px-6 pb-6">
          {permission.can(OrgPermissionActions.Read, OrgPermissionSubjects.IncidentAccount) ? (
            <OrgIncidentContactsTable />
          ) : (
            <PermissionDeniedBanner />
          )}
        </CardContent>
      </Card>
      <AddOrgIncidentContactModal
        popUp={popUp}
        handlePopUpClose={handlePopUpClose}
        handlePopUpToggle={handlePopUpToggle}
      />
    </>
  );
};
