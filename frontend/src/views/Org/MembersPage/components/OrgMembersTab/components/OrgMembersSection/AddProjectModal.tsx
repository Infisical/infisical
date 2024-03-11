import { Controller, useForm } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import * as yup from "yup";

import { useNotificationContext } from "@app/components/context/Notifications/NotificationProvider";
import { Button, FormControl, Modal, ModalContent } from "@app/components/v2";
import { useOrganization, useWorkspace } from "@app/context";
import { useAddWorkspaceProjectsToUserNonE2EE, useFetchServerStatus } from "@app/hooks/api";
import { UsePopUpState } from "@app/hooks/usePopUp";

import ProjectsTable from "./ProjectsTable";
import { CheckedProjectsMap, ProjectProps } from "./types";

const addProjectFormSchema = yup.object({
  projects: yup
    .object()
    .shape(
      Object.keys({} as CheckedProjectsMap).reduce((acc, key) => {
        acc[key] = yup.boolean().default(false);
        return acc;
      }, {} as Record<string, yup.BooleanSchema>)
    )
    .test("at-least-one-selected", "Select at least one project", (value) => {
      // Check if any of the projects is checked
      return value && Object.values(value).some((selected) => selected === true);
    })
    .required("Selection of projects is required")
    .label("Projects")
});

type TAddProjectForm = yup.InferType<typeof addProjectFormSchema>;

type Props = {
  popUp: UsePopUpState<["addProject"]>;
  handlePopUpToggle: (popUpName: keyof UsePopUpState<["addProject"]>, state?: boolean) => void;
  handlePopUpClose: (popUpName: keyof UsePopUpState<["addProject"]>) => void;
};

const getInitialCheckedProjects = (projects: Array<ProjectProps>): CheckedProjectsMap => {
  const initialCheckProjectsMap: CheckedProjectsMap = {
    all: false
  };

  projects.forEach((project: ProjectProps) => {
    initialCheckProjectsMap[project.id] = false;
  });

  return initialCheckProjectsMap;
};

export const AddProjectModal = ({ popUp, handlePopUpToggle, handlePopUpClose }: Props) => {
  const { createNotification } = useNotificationContext();
  const { currentOrg } = useOrganization();
  const { workspaces } = useWorkspace();
  const email = popUp.addProject?.data?.email || "";
  const userProjects = popUp.addProject?.data?.projects || [];

  const { data: serverDetails } = useFetchServerStatus();

  const { mutateAsync: addProjectsToUserAsync } = useAddWorkspaceProjectsToUserNonE2EE();

  const {
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting }
  } = useForm<TAddProjectForm>({ resolver: yupResolver(addProjectFormSchema) });

  const onAddProject = async ({ projects }: { projects: CheckedProjectsMap }) => {
    if (!currentOrg?.id) return;

    try {
      const selectedProjects: Array<string> = [];
      Object.keys(projects).forEach((projectKey) => {
        if (projectKey !== "all" && projects[projectKey]) {
          selectedProjects.push(projectKey);
        }
      });

      await addProjectsToUserAsync({
        projects: selectedProjects,
        email,
        orgId: currentOrg.id
      });
      createNotification({
        text: "Added projects to user",
        type: "success"
      });
      handlePopUpClose("addProject");
    } catch (error) {
      console.error(error);
      createNotification({
        text: "Failed to invite user to org",
        type: "error"
      });
    }

    if (serverDetails?.emailConfigured) {
      handlePopUpToggle("addProject", false);
    }

    reset();
  };

  return (
    <Modal
      isOpen={popUp?.addProject?.isOpen}
      onOpenChange={(isOpen) => {
        handlePopUpToggle("addProject", isOpen);
      }}
    >
      <ModalContent
        title={`Add projects to user ${email}`}
        subTitle="You can add multiple projects "
      >
        <form onSubmit={handleSubmit(onAddProject)}>
          <Controller
            control={control}
            name="projects"
            defaultValue={getInitialCheckedProjects([...workspaces])}
            render={({ field, fieldState: { error } }) => {
              return (
                <FormControl label="Projects" isError={Boolean(error)} errorText={error?.message}>
                  <ProjectsTable
                    projects={workspaces}
                    userProjects={userProjects}
                    checkedProjects={field.value} // Use field.value to get the value controlled by the Controller
                    setCheckedProjects={(newValue) => {
                      return field.onChange(newValue);
                    }} // Use field.onChange to update the value controlled by the Controller
                  />
                </FormControl>
              );
            }}
          />
          <div className="mt-8 flex items-center">
            <Button
              className="mr-4"
              size="sm"
              type="submit"
              isLoading={isSubmitting}
              isDisabled={isSubmitting}
            >
              Add Projects
            </Button>
            <Button
              colorSchema="secondary"
              variant="plain"
              onClick={() => handlePopUpToggle("addProject", false)}
            >
              Cancel
            </Button>
          </div>
        </form>
      </ModalContent>
    </Modal>
  );
};
