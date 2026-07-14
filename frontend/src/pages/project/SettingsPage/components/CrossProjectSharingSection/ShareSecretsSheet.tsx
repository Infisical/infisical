import { useState } from "react";
import { MultiValue } from "react-select";
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
import {
  useCreateProjectFolderGrant,
  useListProjectFolderGrants
} from "@app/hooks/api/projectFolderGrants";
import { useGetUserProjectsByType } from "@app/hooks/api/projects";
import { Project, ProjectType } from "@app/hooks/api/projects/types";
import { useGetProjectFolders } from "@app/hooks/api/secretFolders";
import { useGetSecretImports } from "@app/hooks/api/secretImports";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
};

export const ShareSecretsSheet = ({ isOpen, onOpenChange }: Props) => {
  const { currentProject } = useProject();
  const [environment, setEnvironment] = useState("");
  const [folderPath, setFolderPath] = useState("/");
  const [targetProjects, setTargetProjects] = useState<Project[]>([]);

  const { data: projects = [], isPending: isProjectsLoading } = useGetUserProjectsByType(
    ProjectType.SecretManager
  );
  const { data: secretImports = [] } = useGetSecretImports({
    projectId: currentProject.id,
    environment,
    path: folderPath,
    options: { enabled: Boolean(environment) && Boolean(folderPath) }
  });
  const { data: existingGrants = [] } = useListProjectFolderGrants(currentProject.id);
  const createGrant = useCreateProjectFolderGrant();

  const pathSegments = folderPath.split("/").filter(Boolean);
  const parentPath = pathSegments.length <= 1 ? "/" : `/${pathSegments.slice(0, -1).join("/")}`;
  const leafName = pathSegments.at(-1) ?? "";

  const { data: parentFolders = [] } = useGetProjectFolders({
    projectId: currentProject.id,
    environment,
    path: parentPath,
    options: { enabled: Boolean(environment) && folderPath !== "/" }
  });

  const selectedFolderId = parentFolders.find((f) => f.name === leafName)?.id;

  const grantedProjectIds = new Set(
    existingGrants
      .filter((g) =>
        selectedFolderId
          ? g.sourceFolderId === selectedFolderId
          : g.environmentSlug === environment && g.folderName === "root"
      )
      .map((g) => g.targetProjectId)
  );

  const availableProjects = projects.filter(
    (p) => p.id !== currentProject.id && !grantedProjectIds.has(p.id)
  );

  const handleSubmit = async () => {
    if (!environment || targetProjects.length === 0 || !folderPath) return;

    try {
      await Promise.all(
        targetProjects.map((project) =>
          createGrant.mutateAsync({
            sourceProjectId: currentProject.id,
            environment,
            secretPath: folderPath,
            targetProjectId: project.id
          })
        )
      );
      createNotification({ text: "Access granted successfully", type: "success" });
      onOpenChange(false);
      setEnvironment("");
      setFolderPath("/");
      setTargetProjects([]);
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
              <Select
                value={environment}
                onValueChange={(val) => {
                  setEnvironment(val);
                  setTargetProjects([]);
                }}
              >
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
                onChange={(val) => {
                  setFolderPath(val);
                  setTargetProjects([]);
                }}
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
                <FieldLabel>Target projects</FieldLabel>
                <FilterableSelect
                  isMulti
                  value={targetProjects}
                  onChange={(options) => setTargetProjects([...(options as MultiValue<Project>)])}
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
            disabled={!environment || targetProjects.length === 0 || !folderPath}
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
