import { useMemo } from "react";
import { Controller, useForm } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import * as yup from "yup";

import { useNotificationContext } from "@app/components/context/Notifications/NotificationProvider";
import { Button, FormControl, Modal, ModalContent } from "@app/components/v2";
import { useOrganization, useWorkspace } from "@app/context";
import { useAddWorkspaceProjectsToUserNonE2EE, useFetchServerStatus } from "@app/hooks/api";

import useFilteredProjects from "./hooks/useFilteredProjects";
import useInitialCheckedProjects from "./hooks/useInitialCheckedProjects";
import ProjectsTable from "./projectsTable/ProjectsTable";
import addProjectFormSchema from "./utils/addProjectFormSchema";
import { CheckboxKeys, CheckedProjectsMap, DataProps, Props } from "./types";

type TAddProjectForm = yup.InferType<typeof addProjectFormSchema>;

export const AddProjectModal = ({ popUp, handlePopUpToggle, handlePopUpClose }: Props) => {
  const { createNotification } = useNotificationContext();
  const { currentOrg } = useOrganization();
  const { workspaces } = useWorkspace();
  const data = popUp.addProject?.data as DataProps;

  const email = data?.email || "";
  const userProjects = useMemo(() => data?.projects || [], [popUp.addProject]);

  const { data: serverDetails } = useFetchServerStatus();

  const { mutateAsync: addProjectsToUserAsync } = useAddWorkspaceProjectsToUserNonE2EE();

  const {
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting },
    setValue,
    getValues
  } = useForm<TAddProjectForm>({ resolver: yupResolver(addProjectFormSchema) });

  const { filteredProjects, searchValue, setSearchValue, setFilteredProjects } =
    useFilteredProjects({
      userProjects,
      workspaces
    });

  useInitialCheckedProjects({ filteredProjects, getValues, workspaces, setValue });

  const resetForm = () => {
    reset();
    setSearchValue("");
    setFilteredProjects([]);
  };

  const onAddProject = async ({ projects }: { projects: CheckedProjectsMap }) => {
    if (!currentOrg?.id) return;

    try {
      const selectedProjects: Array<string> = [];
      Object.keys(projects).forEach((projectKey) => {
        if (projectKey !== CheckboxKeys.ALL && projects[projectKey]) {
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

    resetForm();
  };

  return (
    <Modal
      isOpen={popUp?.addProject?.isOpen}
      onOpenChange={(isOpen) => {
        handlePopUpToggle("addProject", isOpen);
        resetForm();
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
            render={({ field, fieldState: { error } }) => {
              return (
                <FormControl label="Projects" isError={Boolean(error)} errorText={error?.message}>
                  <ProjectsTable
                    projects={[...filteredProjects]}
                    preservedCheckedProjects={field.value}
                    setCheckedProjects={(newValue) => field.onChange(newValue)}
                    searchValue={searchValue}
                    setSearchValue={setSearchValue}
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
              onClick={() => {
                handlePopUpToggle("addProject", false);
                resetForm();
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      </ModalContent>
    </Modal>
  );
};
