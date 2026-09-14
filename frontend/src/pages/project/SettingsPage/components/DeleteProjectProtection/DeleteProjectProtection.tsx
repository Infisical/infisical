import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Checkbox,
  Field,
  FieldContent,
  FieldLabel
} from "@app/components/v3";
import { ProjectPermissionActions, ProjectPermissionSub, useProject } from "@app/context";
import { useUpdateProject } from "@app/hooks/api";

export const DeleteProjectProtection = () => {
  const { projectId, currentProject } = useProject();

  const { mutateAsync, isPending } = useUpdateProject();

  const handleToggleDeleteProjectProtection = async (state: boolean) => {
    await mutateAsync({
      projectId,
      hasDeleteProtection: state
    });

    const text = `Successfully ${state ? "enabled" : "disabled"} delete protection`;
    createNotification({
      text,
      type: "success"
    });
  };

  return (
    <Card className="mb-6 gap-0 overflow-hidden p-0">
      <CardHeader className="p-6">
        <CardTitle>Delete Protection</CardTitle>
        <CardDescription>Prevent this project from being deleted accidentally.</CardDescription>
      </CardHeader>
      <CardContent className="px-6 pb-6">
        <ProjectPermissionCan I={ProjectPermissionActions.Edit} a={ProjectPermissionSub.Settings}>
          {(isAllowed) => (
            <Field
              orientation="horizontal"
              data-disabled={!isAllowed || isPending}
              className="items-start"
            >
              <Checkbox
                id="hasDeleteProtection"
                variant="project"
                isDisabled={!isAllowed || isPending}
                isChecked={currentProject?.hasDeleteProtection ?? false}
                onCheckedChange={(state) => {
                  if (state !== "indeterminate") {
                    handleToggleDeleteProjectProtection(state);
                  }
                }}
              />
              <FieldContent>
                <FieldLabel htmlFor="hasDeleteProtection" size="sm">
                  Protects the project from being deleted accidentally. While this option is
                  enabled, you can&apos;t delete the project.
                </FieldLabel>
              </FieldContent>
            </Field>
          )}
        </ProjectPermissionCan>
      </CardContent>
    </Card>
  );
};
