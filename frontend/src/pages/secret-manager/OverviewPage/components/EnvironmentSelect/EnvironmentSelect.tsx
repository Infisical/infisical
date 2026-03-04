import { SetStateAction, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CheckIcon, ChevronsUpDownIcon, PlusIcon } from "lucide-react";

import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";
import { ProjectPermissionCan } from "@app/components/permissions";
import {
  Button,
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  Popover,
  PopoverContent,
  PopoverTrigger
} from "@app/components/v3";
import { cn } from "@app/components/v3/utils";
import {
  ProjectPermissionActions,
  ProjectPermissionSub,
  useProject,
  useSubscription
} from "@app/context";
import { usePopUp } from "@app/hooks";
import { projectKeys } from "@app/hooks/api";
import { ProjectEnv } from "@app/hooks/api/types";
import { AddEnvironmentModal } from "@app/pages/secret-manager/SettingsPage/components/EnvironmentSection/AddEnvironmentModal";

type Props = {
  selectedEnvs: ProjectEnv[];
  setSelectedEnvs: (value: SetStateAction<ProjectEnv[]>) => void;
};

export function EnvironmentSelect({ selectedEnvs, setSelectedEnvs }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState("");

  const {
    currentProject: { environments: projectEnvs, id: projectId }
  } = useProject();
  const { subscription } = useSubscription();
  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp([
    "createEnvironment",
    "upgradePlan"
  ] as const);
  const queryClient = useQueryClient();

  const isMoreEnvironmentsAllowed =
    subscription?.environmentLimit && projectEnvs
      ? projectEnvs.length < subscription.environmentLimit
      : true;

  const handleAddEnvironment = () => {
    if (isMoreEnvironmentsAllowed) {
      handlePopUpOpen("createEnvironment");
    } else {
      handlePopUpOpen("upgradePlan");
    }
  };

  let label: string;

  if (selectedEnvs.length === 1) {
    label = selectedEnvs[0].name;
  } else if (selectedEnvs.length > 0 && selectedEnvs.length < projectEnvs.length) {
    label = `${selectedEnvs.length} Environments`;
  } else {
    label = "All Environments";
  }

  const handleSelectAll = () => setSelectedEnvs([]);

  const handleSelectEnv = (envId: string) => {
    setSelectedEnvs((prev) => {
      if (prev.map((env) => env.id).includes(envId)) {
        return prev.filter((env) => env.id !== envId);
      }

      const selectedEnv = projectEnvs.find((env) => env.id === envId);

      if (selectedEnv) return [...prev, selectedEnv];

      return prev;
    });
  };

  return (
    <>
      <AddEnvironmentModal
        isOpen={popUp.createEnvironment.isOpen}
        onOpenChange={(open) => handlePopUpToggle("createEnvironment", open)}
        onComplete={async (newEnv) => {
          await queryClient.refetchQueries({
            queryKey: projectKeys.getProjectById(projectId)
          });
          setSelectedEnvs([newEnv]);
        }}
      />
      <UpgradePlanModal
        isOpen={popUp.upgradePlan.isOpen}
        onOpenChange={(open) => handlePopUpToggle("upgradePlan", open)}
        text="Your current plan does not include access to adding custom environments. To unlock this feature, please upgrade to Infisical Pro plan."
      />
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={isOpen}
            className="w-[180px] justify-between"
          >
            <span className="truncate">{label}</span>
            <ChevronsUpDownIcon className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[180px] p-0">
          <Command>
            <CommandInput
              value={inputValue}
              onValueChange={setInputValue}
              placeholder="Filter environments"
            />
            <CommandList>
              <CommandEmpty>No environment found.</CommandEmpty>
              {Boolean(projectEnvs.length) && !inputValue && (
                <>
                  <CommandGroup>
                    <CommandItem forceMount keywords={[]} onSelect={handleSelectAll}>
                      <CheckIcon
                        className={cn(
                          "h-4 w-4",
                          !selectedEnvs.length ? "opacity-100" : "opacity-0"
                        )}
                      />
                      All Environments
                    </CommandItem>
                  </CommandGroup>
                  <CommandSeparator />
                </>
              )}
              <CommandGroup>
                {projectEnvs.map((env) => (
                  <CommandItem
                    key={env.id}
                    value={env.id}
                    onSelect={handleSelectEnv}
                    keywords={[env.name, env.slug]}
                    title={env.name}
                  >
                    <CheckIcon
                      className={cn(
                        "h-4 w-4 shrink-0",
                        selectedEnvs.map((e) => e.id).includes(env.id) ? "opacity-100" : "opacity-0"
                      )}
                    />
                    <span className="truncate">{env.name}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
            <CommandSeparator alwaysRender />
            <CommandGroup forceMount>
              <ProjectPermissionCan
                I={ProjectPermissionActions.Create}
                a={ProjectPermissionSub.Environments}
              >
                {(isAllowed) => (
                  <CommandItem
                    forceMount
                    keywords={[]}
                    disabled={!isAllowed}
                    onSelect={handleAddEnvironment}
                  >
                    <PlusIcon className="h-4 w-4 shrink-0" />
                    <span>Add Environment</span>
                  </CommandItem>
                )}
              </ProjectPermissionCan>
            </CommandGroup>
          </Command>
        </PopoverContent>
      </Popover>
    </>
  );
}
