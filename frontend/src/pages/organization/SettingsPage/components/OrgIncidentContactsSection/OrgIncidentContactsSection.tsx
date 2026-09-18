import { Plus, Siren } from "lucide-react";

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
      <Card>
        <CardHeader>
          <CardTitle>
            <Siren className="size-4 text-accent" />
            Incident Contacts
          </CardTitle>
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
        <CardContent>
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
