import { Helmet } from "react-helmet";
import { KeyRound } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import { PageHeader } from "@app/components/v2";
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
import { ProjectType } from "@app/hooks/api/projects/types";

import { HoneyTokenSection } from "./honey-token-config/HoneyTokenSection";
import { ProjectTemplatesSection } from "./project-templates/ProjectTemplatesSection";

export const ProductSettingsPage = () => {
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
    <>
      <Helmet>
        <title>Product Settings | Infisical</title>
        <link rel="icon" href="/infisical.ico" />
      </Helmet>
      <div className="h-full">
        <div className="mx-auto h-full w-full max-w-8xl bg-bunker-800 text-white">
          <PageHeader
            scope={ProjectType.SecretManager}
            title="Product Settings"
            description="Configure organization-wide settings for secrets management projects."
          />
          <div className="flex flex-col gap-4 pb-8">
            <Card>
              <CardHeader>
                <CardTitle>
                  <KeyRound className="size-4 text-accent" />
                  Policies
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
                    <OrgPermissionCan
                      I={OrgPermissionActions.Edit}
                      a={OrgPermissionSubjects.Settings}
                    >
                      {(isAllowed) => (
                        <Switch
                          id="block-duplicate-secret-sync-destinations"
                          variant="project"
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
            <OrgPermissionCan
              I={OrgPermissionActions.Read}
              a={OrgPermissionSubjects.ProjectTemplates}
            >
              {(isAllowed) => isAllowed && <ProjectTemplatesSection />}
            </OrgPermissionCan>
          </div>
        </div>
      </div>
    </>
  );
};
