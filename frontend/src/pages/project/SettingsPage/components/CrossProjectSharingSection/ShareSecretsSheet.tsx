import { useEffect, useState } from "react";
import { MultiValue } from "react-select";
import { ArrowDown, Box, FolderIcon, Layers, Plus, Trash2, X } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  Field,
  FieldGroup,
  FilterableSelect,
  IconButton,
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
  TProjectFolderGrant,
  useCreateProjectFolderGrant,
  useDeleteProjectFolderGrant
} from "@app/hooks/api/projectFolderGrants";
import { useGetUserProjectsByType } from "@app/hooks/api/projects";
import { Project, ProjectType } from "@app/hooks/api/projects/types";
import { useGetProjectFolders } from "@app/hooks/api/secretFolders/queries";

type EnvironmentGroup = {
  environment: string;
  secretPaths: string[];
};

const normalizePath = (p: string) => {
  const segments = p.split("/").filter(Boolean);
  return segments.length === 0 ? "/" : `/${segments.join("/")}`;
};

const flattenGroups = (groups: EnvironmentGroup[]) =>
  groups.flatMap((g) =>
    g.secretPaths.map((sp) => ({ environment: g.environment, secretPath: sp }))
  );

const entryKey = (environment: string, secretPath: string) =>
  `${environment}:${normalizePath(secretPath)}`;

export type ShareSecretsEditData = {
  targetProjectId: string;
  targetProjectName: string;
  grants: TProjectFolderGrant[];
};

type PathAdderProps = {
  environment: string;
  existingPaths: string[];
  onAdd: (path: string) => void;
};

const PathAdder = ({ environment, existingPaths, onAdd }: PathAdderProps) => {
  const { currentProject } = useProject();
  const [value, setValue] = useState("/");

  const normalized = normalizePath(value);
  const isRoot = normalized === "/";
  const parentPath = isRoot ? "/" : normalized.substring(0, normalized.lastIndexOf("/")) || "/";
  const folderName = isRoot ? "" : (normalized.split("/").filter(Boolean).pop() ?? "");

  const { data: folders = [] } = useGetProjectFolders({
    projectId: currentProject.id,
    environment,
    path: parentPath,
    options: { enabled: Boolean(environment) && !isRoot }
  });

  const pathExists = isRoot || folders.some((f) => f.name === folderName);
  const canAdd = value.trim().length > 0 && !existingPaths.includes(normalized) && pathExists;

  const handleAdd = () => {
    if (!canAdd) return;
    onAdd(normalized);
    setValue("/");
  };

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1">
        <SecretPathInput
          value={value}
          onChange={setValue}
          environment={environment}
          placeholder="Add a folder path..."
          onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleAdd();
            }
          }}
        />
      </div>
      <IconButton variant="ghost-muted" size="sm" onClick={handleAdd} isDisabled={!canAdd}>
        <Plus />
      </IconButton>
    </div>
  );
};

type EnvironmentGroupRowProps = {
  group: EnvironmentGroup;
  index: number;
  environments: { id: string; slug: string; name: string }[];
  onChangeEnvironment: (index: number, env: string) => void;
  onAddPath: (index: number, path: string) => void;
  onRemovePath: (index: number, pathIndex: number) => void;
  onRemoveGroup: (index: number) => void;
};

const EnvironmentGroupRow = ({
  group,
  index,
  environments,
  onChangeEnvironment,
  onAddPath,
  onRemovePath,
  onRemoveGroup
}: EnvironmentGroupRowProps) => {
  const envName = environments.find((e) => e.slug === group.environment)?.name;

  return (
    <div className="overflow-hidden rounded-md border border-border">
      <div className="flex items-center gap-2 px-3 py-2.5">
        <Layers className="size-4 shrink-0 text-muted" />
        {group.environment ? (
          <span className="flex-1 text-sm font-medium">{envName ?? group.environment}</span>
        ) : (
          <div className="flex-1">
            <Select
              value={group.environment}
              onValueChange={(val) => onChangeEnvironment(index, val)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select environment" />
              </SelectTrigger>
              <SelectContent position="popper">
                {environments.map((env) => (
                  <SelectItem key={env.id} value={env.slug}>
                    {env.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <IconButton variant="ghost-muted" size="xs" onClick={() => onRemoveGroup(index)}>
          <Trash2 />
        </IconButton>
      </div>

      {group.secretPaths.map((sp, pathIndex) => (
        <div key={sp} className="flex items-center gap-2 border-t border-border px-3 py-2.5">
          <FolderIcon className="size-3.5 shrink-0 text-warning" />
          <span className="flex-1 text-sm">{sp}</span>
          <button
            type="button"
            className="text-muted transition-colors hover:text-foreground"
            onClick={() => onRemovePath(index, pathIndex)}
          >
            <X className="size-3.5" />
          </button>
        </div>
      ))}

      {group.environment && (
        <div className="border-t border-border px-3 py-2.5">
          <PathAdder
            environment={group.environment}
            existingPaths={group.secretPaths}
            onAdd={(path) => onAddPath(index, path)}
          />
        </div>
      )}
    </div>
  );
};

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  editData?: ShareSecretsEditData | null;
  existingGrants?: TProjectFolderGrant[];
};

export const ShareSecretsSheet = ({
  isOpen,
  onOpenChange,
  editData,
  existingGrants = []
}: Props) => {
  const { currentProject } = useProject();
  const [groups, setGroups] = useState<EnvironmentGroup[]>([{ environment: "", secretPaths: [] }]);
  const [targetProjects, setTargetProjects] = useState<Project[]>([]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const createGrant = useCreateProjectFolderGrant();
  const deleteGrant = useDeleteProjectFolderGrant();
  const { data: projects = [], isPending: isProjectsLoading } = useGetUserProjectsByType(
    ProjectType.SecretManager
  );

  const isEditMode = Boolean(editData);

  useEffect(() => {
    if (!isOpen) return;

    if (editData) {
      const groupMap = new Map<string, string[]>();
      editData.grants.forEach((g) => {
        const paths = groupMap.get(g.environmentSlug) ?? [];
        paths.push(g.secretPath);
        groupMap.set(g.environmentSlug, paths);
      });
      const initialGroups: EnvironmentGroup[] = Array.from(groupMap.entries()).map(
        ([env, paths]) => ({ environment: env, secretPaths: paths })
      );
      setGroups(initialGroups.length > 0 ? initialGroups : [{ environment: "", secretPaths: [] }]);
      setTargetProjects([]);
    } else {
      setGroups([{ environment: "", secretPaths: [] }]);
      setTargetProjects([]);
    }
  }, [isOpen, editData]);

  useEffect(() => {
    if (!isOpen || !editData || targetProjects.length > 0) return;

    const matchingProject = projects.find((p) => p.id === editData.targetProjectId);
    if (matchingProject) {
      setTargetProjects([matchingProject]);
    }
  }, [isOpen, editData, projects, targetProjects.length]);

  const availableProjects = projects.filter((p) => p.id !== currentProject.id);

  const hasValidEntry = groups.some((g) => g.environment && g.secretPaths.length > 0);

  const handleChangeEnvironment = (index: number, env: string) => {
    setGroups((prev) =>
      prev.map((g, i) => (i === index ? { ...g, environment: env, secretPaths: ["/"] } : g))
    );
  };

  const handleAddPath = (index: number, path: string) => {
    setGroups((prev) =>
      prev.map((g, i) => (i === index ? { ...g, secretPaths: [...g.secretPaths, path] } : g))
    );
  };

  const handleRemovePath = (groupIndex: number, pathIndex: number) => {
    setGroups((prev) =>
      prev.map((g, i) =>
        i === groupIndex
          ? { ...g, secretPaths: g.secretPaths.filter((_, pi) => pi !== pathIndex) }
          : g
      )
    );
  };

  const handleRemoveGroup = (index: number) => {
    setGroups((prev) => {
      const next = prev.filter((_, i) => i !== index);
      if (next.length === 0) return [{ environment: "", secretPaths: [] }];
      return next;
    });
  };

  const handleAddGroup = () => {
    setGroups((prev) => [...prev, { environment: "", secretPaths: [] }]);
  };

  const handleSubmit = async () => {
    const validEntries = flattenGroups(groups).filter((e) => e.environment && e.secretPath);
    if (validEntries.length === 0 || (!isEditMode && targetProjects.length === 0)) return;

    const existingGrantKeys = new Set(
      existingGrants.map((g) => `${g.targetProjectId}:${g.environmentSlug}:${g.secretPath}`)
    );

    setIsSubmitting(true);
    try {
      const operations: Promise<unknown>[] = [];

      if (editData) {
        const currentKeys = new Set(validEntries.map((e) => entryKey(e.environment, e.secretPath)));
        const originalKeys = new Set(
          editData.grants.map((g) => entryKey(g.environmentSlug, g.secretPath))
        );

        editData.grants.forEach((g) => {
          const key = entryKey(g.environmentSlug, g.secretPath);
          if (!currentKeys.has(key)) {
            operations.push(
              deleteGrant.mutateAsync({ grantId: g.id, sourceProjectId: currentProject.id })
            );
          }
        });

        validEntries.forEach((entry) => {
          if (!originalKeys.has(entryKey(entry.environment, entry.secretPath))) {
            operations.push(
              createGrant.mutateAsync({
                sourceProjectId: currentProject.id,
                environment: entry.environment,
                secretPath: entry.secretPath,
                targetProjectId: editData.targetProjectId
              })
            );
          }
        });
      } else {
        validEntries.forEach((entry) => {
          targetProjects.forEach((project) => {
            const grantKey = `${project.id}:${entry.environment}:${entry.secretPath}`;
            if (existingGrantKeys.has(grantKey)) return;

            operations.push(
              createGrant.mutateAsync({
                sourceProjectId: currentProject.id,
                environment: entry.environment,
                secretPath: entry.secretPath,
                targetProjectId: project.id
              })
            );
          });
        });
      }

      await Promise.all(operations);

      createNotification({
        text: isEditMode ? "Grants updated successfully" : "Access granted successfully",
        type: "success"
      });
      onOpenChange(false);
    } catch (err) {
      console.error(err);
      createNotification({ text: "Failed to save grants", type: "error" });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader className="border-b">
          <SheetTitle>{isEditMode ? "Edit Shared Secrets" : "Share Secrets"}</SheetTitle>
          <SheetDescription>
            {isEditMode
              ? "Add or remove environment and folder combinations shared with this project."
              : "Select which project receives read access and optionally scope what they can see."}
          </SheetDescription>
        </SheetHeader>

        <div className="thin-scrollbar flex-1 overflow-y-auto px-4">
          <FieldGroup>
            <div>
              <p className="text-xs font-semibold tracking-widest text-muted uppercase">
                Environments &amp; Folders
              </p>
              <p className="mt-1 text-xs text-muted">
                Choose an environment, then pick which of its folders to share.
              </p>
            </div>

            <div className="flex flex-col gap-3">
              {groups.map((group, index) => (
                <EnvironmentGroupRow
                  key={group.environment || `new-${String(index)}`}
                  group={group}
                  index={index}
                  environments={currentProject.environments}
                  onChangeEnvironment={handleChangeEnvironment}
                  onAddPath={handleAddPath}
                  onRemovePath={handleRemovePath}
                  onRemoveGroup={handleRemoveGroup}
                />
              ))}
            </div>

            <Button variant="outline" size="sm" className="w-fit" onClick={handleAddGroup}>
              <Layers className="size-3.5" />
              Add another environment
            </Button>

            <div className="flex justify-center py-2">
              <ArrowDown className="size-4 text-muted" />
            </div>

            <div className="rounded-md border border-border p-4">
              <p className="mb-1 text-xs font-semibold tracking-widest text-muted uppercase">
                Share With Projects
              </p>
              <p className="mb-4 text-xs text-muted">
                These projects get read access to the folders above.
              </p>

              <Field>
                {isEditMode ? (
                  <div className="flex items-center gap-2 rounded-md border border-border px-3 py-2">
                    <Box className="size-3 text-muted" />
                    <span className="text-sm">{editData!.targetProjectName}</span>
                  </div>
                ) : (
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
                )}
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
            disabled={!hasValidEntry || (!isEditMode && targetProjects.length === 0)}
            isPending={isSubmitting}
            onClick={handleSubmit}
          >
            {isEditMode ? "Save" : "Share"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};
