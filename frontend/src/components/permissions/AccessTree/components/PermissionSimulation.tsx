import { Dispatch, SetStateAction, useState } from "react";
import { useFormContext } from "react-hook-form";
import { Panel } from "@xyflow/react";
import { ChevronDownIcon, ChevronUpIcon } from "lucide-react";

import {
  Button,
  Field,
  FieldLabel,
  IconButton,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@app/components/v3";
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
        <Button size="xs" className="mr-1" variant="outline" onClick={handlePermissionSimulation}>
          Permission Simulation
          <ChevronDownIcon />
        </Button>
      </Panel>
    );

  return (
    <Panel
      onClick={handlePermissionSimulation}
      position="top-left"
      className={`group flex flex-col gap-2 pr-4 pb-4 ${expand ? "" : "cursor-pointer"}`}
    >
      <div className="flex w-[min(20rem,calc(100vw-2rem))] flex-col gap-3 rounded-md border border-border bg-popover p-3 text-foreground shadow-lg">
        <div>
          <div className="flex w-full items-center justify-between">
            <span className="text-sm">Permission Simulation</span>
            <IconButton
              variant="ghost-muted"
              size="xs"
              aria-label={
                expand ? "Collapse permission simulation" : "Expand permission simulation"
              }
              onClick={(e) => {
                e.stopPropagation();
                setExpand((prev) => !prev);
              }}
            >
              {expand ? <ChevronUpIcon /> : <ChevronDownIcon />}
            </IconButton>
          </div>
          {expand && (
            <p className="text-xs text-muted">
              Evaluate conditional policies to see what permissions will be granted given a secret
              name or tags
            </p>
          )}
        </div>
        {expand && (
          <>
            <Field>
              <FieldLabel htmlFor="access-tree-simulation-subject">Subject</FieldLabel>
              <Select
                value={subject}
                onValueChange={(value) => setSubject(value as ProjectPermissionSub)}
              >
                <SelectTrigger id="access-tree-simulation-subject" className="w-full capitalize">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper">
                  {[
                    ProjectPermissionSub.Secrets,
                    ProjectPermissionSub.SecretFolders,
                    ProjectPermissionSub.DynamicSecrets,
                    ProjectPermissionSub.SecretImports
                  ].map((sub) => (
                    <SelectItem className="capitalize" value={sub} key={sub}>
                      {sub.replace("-", " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="access-tree-simulation-environment">Environment</FieldLabel>
              <Select value={environment} onValueChange={setEnvironment}>
                <SelectTrigger
                  id="access-tree-simulation-environment"
                  className="w-full capitalize"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper" className="max-w-76">
                  {environments.map(({ name, slug }) => (
                    <SelectItem value={slug} key={slug}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            {subject === ProjectPermissionSub.Secrets && (
              <Field>
                <FieldLabel htmlFor="access-tree-simulation-secret-name">Secret Name</FieldLabel>
                <Input
                  id="access-tree-simulation-secret-name"
                  placeholder="*"
                  value={secretName}
                  onChange={(e) => setSecretName(e.target.value)}
                />
              </Field>
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
