import { useMemo } from "react";
import { components, MenuProps, OptionProps } from "react-select";
import { faStar } from "@fortawesome/free-regular-svg-icons";
import { faChevronRight, faPlus, faStar as faSolidStar } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { twMerge } from "tailwind-merge";

import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";
import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import { NewProjectModal } from "@app/components/projects";
import { Button, FilterableSelect } from "@app/components/v2";
import {
  OrgPermissionActions,
  OrgPermissionSubjects,
  useOrganization,
  useSubscription,
  useWorkspace
} from "@app/context";
import { getProjectTitle } from "@app/helpers/project";
import { usePopUp } from "@app/hooks";
import { useGetUserWorkspaces } from "@app/hooks/api";
import { useUpdateUserProjectFavorites } from "@app/hooks/api/users/mutation";
import { useGetUserProjectFavorites } from "@app/hooks/api/users/queries";
import { ProjectType, Workspace } from "@app/hooks/api/workspace/types";

type TWorkspaceWithFaveProp = Workspace & { isFavorite: boolean };

const ProjectsMenu = ({ children, ...props }: MenuProps<TWorkspaceWithFaveProp>) => {
  return (
    <components.Menu {...props}>
      {children}
      <hr className="mb-2 h-px border-0 bg-mineshaft-500" />
      <OrgPermissionCan I={OrgPermissionActions.Create} a={OrgPermissionSubjects.Workspace}>
        {(isAllowed) => (
          <Button
            className="w-full bg-mineshaft-700 pt-2 text-bunker-200"
            colorSchema="primary"
            variant="outline_bg"
            size="xs"
            isDisabled={!isAllowed}
            onClick={() => props.clearValue()}
            leftIcon={<FontAwesomeIcon icon={faPlus} />}
          >
            Add Project
          </Button>
        )}
      </OrgPermissionCan>
    </components.Menu>
  );
};

const ProjectOption = ({
  isSelected,
  children,
  data,
  ...props
}: OptionProps<TWorkspaceWithFaveProp>) => {
  const { currentOrg } = useOrganization();
  const { mutateAsync: updateUserProjectFavorites } = useUpdateUserProjectFavorites();
  const { data: projectFavorites } = useGetUserProjectFavorites(currentOrg.id);

  const removeProjectFromFavorites = async (projectId: string) => {
    try {
      await updateUserProjectFavorites({
        orgId: currentOrg!.id,
        projectFavorites: [...(projectFavorites || []).filter((entry) => entry !== projectId)]
      });
    } catch {
      createNotification({
        text: "Failed to remove project from favorites.",
        type: "error"
      });
    }
  };

  const addProjectToFavorites = async (projectId: string) => {
    try {
      await updateUserProjectFavorites({
        orgId: currentOrg!.id,
        projectFavorites: [...(projectFavorites || []), projectId]
      });
    } catch {
      createNotification({
        text: "Failed to add project to favorites.",
        type: "error"
      });
    }
  };
  return (
    <components.Option
      isSelected={isSelected}
      data={data}
      {...props}
      className={twMerge(props.className, isSelected && "bg-mineshaft-500")}
    >
      <div className="flex w-full items-center">
        {isSelected && (
          <FontAwesomeIcon className="mr-2 text-primary" icon={faChevronRight} size="xs" />
        )}
        <p className="truncate">{children}</p>
        {data.isFavorite ? (
          <FontAwesomeIcon
            icon={faSolidStar}
            className="ml-auto text-sm text-yellow-600 hover:text-mineshaft-400"
            onClick={async (e) => {
              e.stopPropagation();
              await removeProjectFromFavorites(data.id);
            }}
          />
        ) : (
          <FontAwesomeIcon
            icon={faStar}
            className="ml-auto text-sm text-mineshaft-400 hover:text-mineshaft-300"
            onClick={async (e) => {
              e.stopPropagation();
              await addProjectToFavorites(data.id);
            }}
          />
        )}
      </div>
    </components.Option>
  );
};

export const ProjectSelect = () => {
  const { currentWorkspace } = useWorkspace();
  const { currentOrg } = useOrganization();
  const { data: workspaces = [] } = useGetUserWorkspaces({ type: currentWorkspace.type });
  const { data: projectFavorites } = useGetUserProjectFavorites(currentOrg.id!);

  const { subscription } = useSubscription();

  const isAddingProjectsAllowed = subscription?.workspaceLimit
    ? subscription.workspacesUsed < subscription.workspaceLimit
    : true;

  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp([
    "addNewWs",
    "upgradePlan"
  ] as const);

  const { options, value } = useMemo(() => {
    const projectOptions = workspaces
      .map((w): Workspace & { isFavorite: boolean } => ({
        ...w,
        isFavorite: Boolean(projectFavorites?.includes(w.id))
      }))
      .sort((a, b) => Number(b.isFavorite) - Number(a.isFavorite));

    const currentOption = projectOptions.find((option) => option.id === currentWorkspace?.id);

    if (!currentOption) {
      return {
        options: projectOptions,
        value: null
      };
    }

    return {
      options: [
        currentOption,
        ...projectOptions.filter((option) => option.id !== currentOption.id)
      ],
      value: currentOption
    };
  }, [workspaces, projectFavorites, currentWorkspace]);

  return (
    <div className="mt-2 w-full p-3">
      <p className="mb-1 ml-1.5 text-xs font-semibold uppercase text-gray-400">
        {currentWorkspace?.type ? getProjectTitle(currentWorkspace?.type) : "Project"}
      </p>
      <FilterableSelect
        className="text-sm"
        value={value}
        filterOption={(option, inputValue) =>
          option.data.name.toLowerCase().includes(inputValue.toLowerCase())
        }
        getOptionLabel={(option) => option.name}
        getOptionValue={(option) => option.id}
        onChange={(newValue) => {
          // hacky use of null as indication to create project
          if (!newValue) {
            if (isAddingProjectsAllowed) {
              handlePopUpOpen("addNewWs");
            } else {
              handlePopUpOpen("upgradePlan");
            }
            return;
          }

          const project = newValue as TWorkspaceWithFaveProp;
          // todo(akhi): this is not using react query because react query in overview is throwing error when envs are not exact same count
          // to reproduce change this back to router.push and switch between two projects with different env count
          // look into this on dashboard revamp
          window.location.assign(`/${project.type}/${project.id}/overview`);
        }}
        options={options}
        components={{
          Option: ProjectOption,
          Menu: ProjectsMenu
        }}
      />
      <UpgradePlanModal
        isOpen={popUp.upgradePlan.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("upgradePlan", isOpen)}
        text="You have exceeded the number of projects allowed on the free plan."
      />

      <NewProjectModal
        isOpen={popUp.addNewWs.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("addNewWs", isOpen)}
        projectType={currentWorkspace?.type || ProjectType.SecretManager}
      />
    </div>
  );
};
