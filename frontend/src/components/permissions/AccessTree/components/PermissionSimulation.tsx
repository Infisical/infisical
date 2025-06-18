import { Dispatch, SetStateAction, useState } from "react";
import { useFormContext } from "react-hook-form";
import { faChevronDown, faChevronUp } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Panel } from "@xyflow/react";

import { Button, FormLabel, IconButton, Input, Select, SelectItem } from "@app/components/v2";
import { ProjectPermissionSub } from "@app/context";
import { MetadataForm } from "@app/pages/secret-manager/SecretDashboardPage/components/DynamicSecretListView/MetadataForm";

import { ViewMode } from "../types";

type TProps = {
  secretName: string;
  setSecretName: Dispatch<SetStateAction<string>>;
  viewMode: ViewMode;
  setViewMode: Dispatch<SetStateAction<ViewMode>>;
  setEnvironment: Dispatch<SetStateAction<string>>;
  environment: string;
  subject: ProjectPermissionSub;
  setSubject: Dispatch<SetStateAction<ProjectPermissionSub>>;
  environments: { name: string; slug: string }[];
};

export const PermissionSimulation = ({
  setEnvironment,
  environment,
  subject,
  setSubject,
  environments,
  setViewMode,
  viewMode,
  secretName,
  setSecretName
}: TProps) => {
  const [expand, setExpand] = useState(false);
  const { control } = useFormContext();

  const handlePermissionSimulation = () => {
    setExpand(true);
    setViewMode(ViewMode.Modal);
  };

  if (viewMode !== ViewMode.Modal)
    return (
      <Panel position="top-left">
        <Button
          size="xs"
          className="mr-1 rounded"
          colorSchema="secondary"
          onClick={handlePermissionSimulation}
          rightIcon={
            <FontAwesomeIcon
              className="pl-1 text-sm text-bunker-300 hover:text-primary hover:opacity-80"
              icon={faChevronDown}
            />
          }
        >
          Permission Simulation
        </Button>
      </Panel>
    );

  return (
    <Panel
      onClick={handlePermissionSimulation}
      position="top-left"
      className={`group flex flex-col gap-2 pb-4 pr-4 ${expand ? "" : "cursor-pointer"}`}
    >
      <div className="flex w-[20rem] flex-col gap-1.5 rounded border border-mineshaft-600 bg-mineshaft-800 p-2 font-inter text-gray-200">
        <div>
          <div className="flex w-full items-center justify-between">
            <span className="text-sm">Permission Simulation</span>
            <IconButton
              variant="plain"
              ariaLabel={expand ? "Collapse" : "Expand"}
              onClick={(e) => {
                e.stopPropagation();
                setExpand((prev) => !prev);
              }}
            >
              <FontAwesomeIcon icon={expand ? faChevronUp : faChevronDown} />
            </IconButton>
          </div>
          {expand && (
            <p className="mb-2 mt-1 text-xs text-mineshaft-400">
              Evaluate conditional policies to see what permissions will be granted given a secret
              name or tags
            </p>
          )}
        </div>
        {expand && (
          <>
            <div>
              <FormLabel label="Subject" />
              <Select
                value={subject}
                onValueChange={(value) => setSubject(value as ProjectPermissionSub)}
                className="w-full border border-mineshaft-500 capitalize"
                position="popper"
                dropdownContainerClassName="max-w-none"
              >
                {[
                  ProjectPermissionSub.Secrets,
                  ProjectPermissionSub.SecretFolders,
                  ProjectPermissionSub.DynamicSecrets,
                  ProjectPermissionSub.SecretImports
                ].map((sub) => {
                  return (
                    <SelectItem className="capitalize" value={sub} key={sub}>
                      {sub.replace("-", " ")}
                    </SelectItem>
                  );
                })}
              </Select>
            </div>
            <div>
              <FormLabel label="Environment" />
              <Select
                value={environment}
                onValueChange={setEnvironment}
                className="w-full border border-mineshaft-500 capitalize"
                position="popper"
                dropdownContainerClassName="max-w-[19rem]"
              >
                {environments.map(({ name, slug }) => {
                  return (
                    <SelectItem value={slug} key={slug}>
                      {name}
                    </SelectItem>
                  );
                })}
              </Select>
            </div>
            {subject === ProjectPermissionSub.Secrets && (
              <div>
                <FormLabel label="Secret Name" />
                <Input
                  placeholder="*"
                  value={secretName}
                  onChange={(e) => setSecretName(e.target.value)}
                />
              </div>
            )}
            {subject === ProjectPermissionSub.DynamicSecrets && (
              <div>
                <MetadataForm control={control} />
              </div>
            )}
          </>
        )}
      </div>
    </Panel>
  );
};
