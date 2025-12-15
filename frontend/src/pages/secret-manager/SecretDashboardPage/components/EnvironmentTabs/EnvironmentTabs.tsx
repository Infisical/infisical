import { useState } from "react";
import { faEllipsisH, faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "@tanstack/react-router";

import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";
import { ProjectPermissionCan } from "@app/components/permissions";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  Modal,
  ModalContent,
  Tab,
  TabList,
  Tabs,
  Tooltip
} from "@app/components/v2";
import { ROUTE_PATHS } from "@app/const/routes";
import {
  ProjectPermissionActions,
  ProjectPermissionSub,
  useOrganization,
  useProject,
  useSubscription
} from "@app/context";
import { usePopUp } from "@app/hooks";
import { projectKeys } from "@app/hooks/api";
import { ProjectEnv } from "@app/hooks/api/projects/types";
import { SubscriptionProductCategory } from "@app/hooks/api/subscriptions/types";
import { AddEnvironmentModal } from "@app/pages/secret-manager/SettingsPage/components/EnvironmentSection/AddEnvironmentModal";

import { CompareEnvironments } from "../CompareEnvironments";

const COMPARE_ENVIRONMENT_TAB = "__COMPARE_ENVIRONMENT_TAB__";
const ADD_ENVIRONMENT_TAB = "__ADD_ENVIRONMENT_TAB__";
const VIEW_MORE_ENVIRONMENT_TAB = "__VIEW_MORE_ENVIRONMENT_TAB__";

type Props = {
  secretPath: string;
};

const TABS_TO_SHOW = 5;

export const EnvironmentTabs = ({ secretPath }: Props) => {
  const { currentOrg } = useOrganization();
  const { currentProject } = useProject();
  const currentEnv = useParams({
    from: ROUTE_PATHS.SecretManager.SecretDashboardPage.id,
    select: (el) => el.envSlug
  });

  const { subscription } = useSubscription();

  const environmentLimit =
    subscription.get(SubscriptionProductCategory.SecretManager, "environmentLimit") || 0;
  const isMoreEnvironmentsAllowed =
    environmentLimit && currentProject?.environments
      ? currentProject.environments.length <= environmentLimit
      : true;

  const [isNavigating, setIsNavigating] = useState(false);

  const navigate = useNavigate();

  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp([
    "compareEnvironments",
    "createEnvironment",
    "upgradePlan"
  ] as const);

  const selectedIndex = currentProject.environments.findIndex((env) => env.slug === currentEnv);

  let tabEnvironments: ProjectEnv[];
  let dropdownEnvironments: ProjectEnv[];

  if (selectedIndex < TABS_TO_SHOW) {
    tabEnvironments = currentProject.environments.slice(0, TABS_TO_SHOW);
    dropdownEnvironments = currentProject.environments.slice(TABS_TO_SHOW);
  } else {
    tabEnvironments = [
      ...currentProject.environments.slice(0, TABS_TO_SHOW - 1),
      currentProject.environments[selectedIndex]
    ];
    dropdownEnvironments = currentProject.environments
      .slice(TABS_TO_SHOW - 1)
      .filter((env) => env.slug !== currentEnv);
  }

  const queryClient = useQueryClient();

  const handleSelect = async (envSlug: string) => {
    if (isNavigating) return;

    setIsNavigating(true);
    await navigate({
      to: ROUTE_PATHS.SecretManager.SecretDashboardPage.path,
      params: {
        envSlug,
        projectId: currentProject.id,
        orgId: currentOrg.id
      },
      search: (prev) => prev
    });
    setIsNavigating(false);
  };

  const handleAddEnvironment = () => {
    if (isMoreEnvironmentsAllowed) {
      handlePopUpOpen("createEnvironment");
    } else {
      handlePopUpOpen("upgradePlan");
    }
  };

  return (
    <>
      <Tabs
        value={currentEnv}
        onValueChange={(value) => {
          if (value === COMPARE_ENVIRONMENT_TAB) {
            handlePopUpOpen("compareEnvironments");
            return;
          }

          if (value === ADD_ENVIRONMENT_TAB) {
            handleAddEnvironment();
            return;
          }

          handleSelect(value);
        }}
        defaultValue="environment-tabs"
      >
        <TabList>
          {tabEnvironments.map((environment) => (
            <Tab key={environment.slug} className="max-w-[12vw] truncate" value={environment.slug}>
              <p className="truncate">{environment.name}</p>
            </Tab>
          ))}
          {dropdownEnvironments.length ? (
            <DropdownMenu>
              <DropdownMenuTrigger>
                <Tab value={VIEW_MORE_ENVIRONMENT_TAB} className="p-0">
                  <Tooltip content="More Environments">
                    <div className="px-3">
                      <FontAwesomeIcon icon={faEllipsisH} />
                    </div>
                  </Tooltip>
                </Tab>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="max-h-[70vh] thin-scrollbar overflow-y-auto"
                sideOffset={2}
                align="center"
              >
                <DropdownMenuLabel>Environments</DropdownMenuLabel>
                <div className="max-h-[40vh] thin-scrollbar overflow-auto">
                  {dropdownEnvironments.map((environment) => (
                    <DropdownMenuItem
                      key={environment.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSelect(environment.slug);
                      }}
                    >
                      {environment.name}
                    </DropdownMenuItem>
                  ))}
                </div>
                <div className="h-1 border-t border-mineshaft-600" />
                <ProjectPermissionCan
                  I={ProjectPermissionActions.Create}
                  a={ProjectPermissionSub.Environments}
                >
                  {(isAllowed) => (
                    <DropdownMenuItem
                      isDisabled={!isAllowed}
                      onClick={handleAddEnvironment}
                      className="data-highlighted:bg-mineshaft-900"
                    >
                      <Button
                        size="xs"
                        variant="outline_bg"
                        leftIcon={<FontAwesomeIcon icon={faPlus} />}
                        className="w-full"
                      >
                        Add Environment
                      </Button>
                    </DropdownMenuItem>
                  )}
                </ProjectPermissionCan>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Tab value={ADD_ENVIRONMENT_TAB} className="p-0">
              <Tooltip content="Add environment">
                <div className="px-3">
                  <FontAwesomeIcon icon={faPlus} />
                </div>
              </Tooltip>
            </Tab>
          )}
          {/* scott: removing until we have time to update for fetching secret value */}
          {/* {currentProject.environments.length > 1 && (
            <Tab className="ml-auto" value={COMPARE_ENVIRONMENT_TAB}>
              <div className="flex items-center gap-x-2 whitespace-nowrap">
                <FontAwesomeIcon icon={faArrowRightArrowLeft} />
                Compare Environments
              </div>
            </Tab>
          )} */}
        </TabList>
      </Tabs>
      <Modal
        isOpen={popUp.compareEnvironments.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("compareEnvironments", isOpen)}
      >
        <ModalContent
          title="Compare Environments"
          subTitle="Compare secrets across multiple environments"
          className="flex h-full w-[95vw]! max-w-none flex-col"
          bodyClassName="flex-1 flex flex-col overflow-hidden"
        >
          <CompareEnvironments secretPath={secretPath} />
        </ModalContent>
      </Modal>
      <UpgradePlanModal
        isOpen={popUp.upgradePlan.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("upgradePlan", isOpen)}
        text="Your current plan does not include access to adding custom environments. To unlock this feature, please upgrade to Infisical Pro plan."
      />
      <AddEnvironmentModal
        isOpen={popUp.createEnvironment.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("createEnvironment", isOpen)}
        onComplete={async (env) => {
          await queryClient.refetchQueries({
            queryKey: projectKeys.getProjectById(currentProject.id)
          });
          handleSelect(env.slug);
        }}
      />
    </>
  );
};
