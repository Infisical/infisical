import { useState } from "react";
import { SingleValue } from "react-select";
import { TriangleAlert } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import {
  Alert,
  AlertDescription,
  Button,
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FilterableSelect,
  SecretPathInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from "@app/components/v3";
import { useProject } from "@app/context";
import { useCreateProjectGrant } from "@app/hooks/api/projectGrants";
import { useGetUserProjectsByType } from "@app/hooks/api/projects";
import { Project, ProjectType } from "@app/hooks/api/projects/types";
import { useGetSecretImports } from "@app/hooks/api/secretImports";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
};

export const ShareSecretsSheet = ({ isOpen, onOpenChange }: Props) => {
  const { currentProject } = useProject();
  const [environment, setEnvironment] = useState("");
  const [folderPath, setFolderPath] = useState("/");
  const [targetProject, setTargetProject] = useState<Project | null>(null);

  const { data: projects = [], isPending: isProjectsLoading } = useGetUserProjectsByType(
    ProjectType.SecretManager
  );
  const { data: secretImports = [] } = useGetSecretImports({
    projectId: currentProject.id,
    environment,
    path: folderPath,
    options: { enabled: Boolean(environment) && Boolean(folderPath) }
  });
  const createGrant = useCreateProjectGrant();

  const availableProjects = projects.filter((p) => p.id !== currentProject.id);

  const handleSubmit = async () => {
    if (!environment || !targetProject || !folderPath) return;

    try {
      await createGrant.mutateAsync({
        sourceProjectId: currentProject.id,
        environment,
        secretPath: folderPath,
        targetProjectId: targetProject.id
      });
      createNotification({ text: "Access granted successfully", type: "success" });
      onOpenChange(false);
      setEnvironment("");
      setFolderPath("/");
      setTargetProject(null);
    } catch (err) {
      console.error(err);
      createNotification({ text: "Failed to create grant", type: "error" });
    }
  };

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader className="border-b">
          <SheetTitle>Share Secrets</SheetTitle>
          <SheetDescription>
            Select which project receives read access and optionally scope what they can see.
          </SheetDescription>
        </SheetHeader>

        <div className="thin-scrollbar flex-1 overflow-y-auto px-4">
          <FieldGroup>
            <p className="text-xs font-semibold tracking-widest text-muted uppercase">
              From This Project
            </p>

            <Field>
              <FieldLabel>Environment</FieldLabel>
              <Select value={environment} onValueChange={setEnvironment}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select environment" />
                </SelectTrigger>
                <SelectContent position="popper">
                  {currentProject.environments.map((env) => (
                    <SelectItem key={env.id} value={env.slug}>
                      {env.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field>
              <FieldLabel>Folder path</FieldLabel>
              <SecretPathInput
                value={folderPath}
                onChange={setFolderPath}
                environment={environment}
                placeholder="/"
              />
              <FieldDescription>
                Secrets at this path become available to the target project.
              </FieldDescription>
            </Field>

            {secretImports.length > 0 && (
              <Alert variant="warning">
                <TriangleAlert />
                <AlertDescription>
                  This folder contains secret imports. Imports aren&apos;t re-shared across
                  projects, so only the folder&apos;s own static secrets will be shared with the
                  target project.
                </AlertDescription>
              </Alert>
            )}

            <div className="rounded-md border border-border p-4">
              <p className="mb-4 text-xs font-semibold tracking-widest text-muted uppercase">
                To Another Project
              </p>

              <Field>
                <FieldLabel>Target project</FieldLabel>
                <FilterableSelect
                  value={targetProject}
                  onChange={(option) => setTargetProject(option as SingleValue<Project>)}
                  isLoading={isProjectsLoading}
                  options={availableProjects}
                  placeholder="Search projects..."
                  getOptionLabel={(option) => option.name}
                  getOptionValue={(option) => option.id}
                />
              </Field>
            </div>
          </FieldGroup>
        </div>

        <SheetFooter>
          <SheetClose asChild>
            <Button variant="outline">Cancel</Button>
          </SheetClose>
          <Button
            variant="project"
            disabled={!environment || !targetProject || !folderPath}
            isPending={createGrant.isPending}
            onClick={handleSubmit}
          >
            Share
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};
