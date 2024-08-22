import { useMemo } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { Button, FormControl, Modal, ModalContent, Select, SelectItem } from "@app/components/v2";
import { useOrganization,useWorkspace } from "@app/context";
import {
  useAddIdentityToWorkspace,
  useGetIdentityProjectMemberships,
  useGetProjectRoles,
  useGetWorkspaceById
} from "@app/hooks/api";
import { UsePopUpState } from "@app/hooks/usePopUp";

const schema = z
  .object({
    projectId: z.string(),
    role: z.string()
  })
  .required();

type FormData = z.infer<typeof schema>;

type Props = {
  identityId: string;
  popUp: UsePopUpState<["addIdentityToProject"]>;
  handlePopUpToggle: (
    popUpName: keyof UsePopUpState<["addIdentityToProject"]>,
    state?: boolean
  ) => void;
};

export const IdentityAddToProjectModal = ({ identityId, popUp, handlePopUpToggle }: Props) => {
  const { currentOrg } = useOrganization();
  const { workspaces } = useWorkspace();
  const { mutateAsync: addIdentityToWorkspace } = useAddIdentityToWorkspace();

  const {
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting },
    watch
  } = useForm<FormData>({
    resolver: zodResolver(schema)
  });

  const projectId = watch("projectId");
  const { data: projectMemberships } = useGetIdentityProjectMemberships(identityId);
  const { data: project } = useGetWorkspaceById(projectId);
  const { data: roles } = useGetProjectRoles(project?.slug ?? "");

  const filteredWorkspaces = useMemo(() => {
    const wsWorkspaceIds = new Map();

    projectMemberships?.forEach((projectMembership) => {
      wsWorkspaceIds.set(projectMembership.project.id, true);
    });

    return (workspaces || []).filter(
      ({ id, orgId }) => !wsWorkspaceIds.has(id) && orgId === currentOrg?.id
    );
  }, [workspaces, projectMemberships]);

  const onFormSubmit = async ({ projectId: workspaceId, role }: FormData) => {
    try {
      await addIdentityToWorkspace({
        workspaceId,
        identityId,
        role: role || undefined
      });

      createNotification({
        text: "Successfully added identity to project",
        type: "success"
      });

      reset();
      handlePopUpToggle("addIdentityToProject", false);
    } catch (err) {
      console.error(err);
      const error = err as any;
      const text = error?.response?.data?.message ?? "Failed to add identity to project";

      createNotification({
        text,
        type: "error"
      });
    }
  };

  return (
    <Modal
      isOpen={popUp?.addIdentityToProject?.isOpen}
      onOpenChange={(isOpen) => {
        handlePopUpToggle("addIdentityToProject", isOpen);
        reset();
      }}
    >
      <ModalContent title="Add Identity to Project">
        <form onSubmit={handleSubmit(onFormSubmit)}>
          <Controller
            control={control}
            name="projectId"
            defaultValue=""
            render={({ field: { onChange, ...field }, fieldState: { error } }) => (
              <FormControl
                label="Project"
                errorText={error?.message}
                isError={Boolean(error)}
                className="mt-4"
              >
                <Select
                  defaultValue={field.value}
                  {...field}
                  onValueChange={(e) => onChange(e)}
                  className="w-full"
                >
                  {(filteredWorkspaces || []).map(({ id, name }) => (
                    <SelectItem value={id} key={`project-${id}`}>
                      {name}
                    </SelectItem>
                  ))}
                </Select>
              </FormControl>
            )}
          />
          <Controller
            control={control}
            name="role"
            defaultValue=""
            render={({ field: { onChange, ...field }, fieldState: { error } }) => (
              <FormControl
                label="Role"
                errorText={error?.message}
                isError={Boolean(error)}
                className="mt-4"
              >
                <Select
                  defaultValue={field.value}
                  {...field}
                  onValueChange={(e) => onChange(e)}
                  className="w-full"
                >
                  {(roles || []).map(({ name, slug }) => (
                    <SelectItem value={slug} key={`project-role-${slug}`}>
                      {name}
                    </SelectItem>
                  ))}
                </Select>
              </FormControl>
            )}
          />
          <div className="flex items-center">
            <Button
              className="mr-4"
              size="sm"
              type="submit"
              isLoading={isSubmitting}
              isDisabled={isSubmitting}
            >
              Add
            </Button>
            <Button
              colorSchema="secondary"
              variant="plain"
              onClick={() => handlePopUpToggle("addIdentityToProject", false)}
            >
              Cancel
            </Button>
          </div>
        </form>
      </ModalContent>
    </Modal>
  );
};
