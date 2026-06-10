import { KeyRound } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldTitle,
  Switch
} from "@app/components/v3";
import { OrgPermissionActions, OrgPermissionSubjects, useOrganization } from "@app/context";
import { useUpdateOrg } from "@app/hooks/api/organization/queries";

import { OrgCertManagerTab } from "../OrgCertManagerTab";
import { HoneyTokenSection } from "./HoneyTokenSection";

export const OrgProductSettingsTab = () => {
  const { currentOrg } = useOrganization();
  const { mutateAsync: updateOrg, isPending } = useUpdateOrg();

  const handleToggle = async (state: boolean) => {
    if (!currentOrg?.id) return;

    await updateOrg({
      orgId: currentOrg.id,
      blockDuplicateSecretSyncDestinations: state
    });

    createNotification({
      text: `Successfully ${state ? "enabled" : "disabled"} blocking duplicate secret sync destinations for this organization`,
      type: "success"
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>
            <KeyRound className="size-4 text-accent" />
            Secrets Management
          </CardTitle>
          <CardDescription>
            Configure organization-wide policies for secrets management.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <Field orientation="horizontal">
              <FieldContent>
                <FieldTitle>Unique Secret Sync Destination Policy</FieldTitle>
                <FieldDescription>
                  When enabled, ensures each destination can only be used by one secret sync
                  configuration, preventing potential conflicts or overwrites.
                </FieldDescription>
              </FieldContent>
              <OrgPermissionCan I={OrgPermissionActions.Edit} a={OrgPermissionSubjects.Settings}>
                {(isAllowed) => (
                  <Switch
                    id="block-duplicate-secret-sync-destinations"
                    variant="org"
                    checked={currentOrg?.blockDuplicateSecretSyncDestinations ?? false}
                    onCheckedChange={(value) => handleToggle(value)}
                    disabled={!isAllowed || isPending}
                  />
                )}
              </OrgPermissionCan>
            </Field>
          </FieldGroup>
        </CardContent>
      </Card>
      <HoneyTokenSection />
      <OrgCertManagerTab />
    </div>
  );
};
