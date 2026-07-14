import { useEffect, useState } from "react";
import { MultiValue } from "react-select";
import { useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import {
  ArrowRight,
  Box,
  FolderIcon,
  Layers,
  Pencil,
  Plus,
  Trash2,
  TriangleAlert
} from "lucide-react";

import { createNotification } from "@app/components/notifications";
import {
  Alert,
  AlertDescription,
  Badge,
  Button,
  Card,
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
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
import { apiRequest } from "@app/config/request";
import { useProject } from "@app/context";
import { TProjectFolderGrant } from "@app/hooks/api/projectFolderGrants";
import { projectFolderGrantKeys } from "@app/hooks/api/projectFolderGrants/queries";
import {
  TCreateProjectFolderGrantDTO,
  TDeleteProjectFolderGrantDTO
} from "@app/hooks/api/projectFolderGrants/types";
import { useGetUserProjectsByType } from "@app/hooks/api/projects";
import { Project, ProjectType } from "@app/hooks/api/projects/types";
import { useGetSecretImports } from "@app/hooks/api/secretImports";

type SourceEntry = {
  environment: string;
  secretPath: string;
};

const EMPTY_ENTRY: SourceEntry = { environment: "", secretPath: "/" };

const entryKey = (e: SourceEntry) => `${e.environment}:${e.secretPath}`;

export type ShareSecretsEditData = {
  targetProjectId: string;
  targetProjectName: string;
  grants: TProjectFolderGrant[];
};

type SourceEntryRowProps = {
  entry: SourceEntry;
  index: number;
  environments: { id: string; slug: string; name: string }[];
  onChange: (index: number, updated: Partial<SourceEntry>) => void;
};

const SourceEntryRow = ({ entry, index, environments, onChange }: SourceEntryRowProps) => {
  const { currentProject } = useProject();
  const { data: secretImports = [] } = useGetSecretImports({
    projectId: currentProject.id,
    environment: entry.environment,
    path: entry.secretPath,
    options: { enabled: Boolean(entry.environment) && Boolean(entry.secretPath) }
  });

  return (
    <div className="flex flex-col gap-3">
      <Field>
        <FieldLabel>Environment</FieldLabel>
        <Select
          value={entry.environment}
          onValueChange={(val) => onChange(index, { environment: val, secretPath: "/" })}
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
      </Field>

      <Field>
        <FieldLabel>Folder path</FieldLabel>
        <SecretPathInput
          value={entry.secretPath}
          onChange={(val) => onChange(index, { secretPath: val })}
          environment={entry.environment}
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
            This folder contains secret imports. Imports aren&apos;t re-shared across projects, so
            only the folder&apos;s own static secrets will be shared with the target project.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
};

type CompactEntryRowProps = {
  entry: SourceEntry;
  envName: string;
  onEdit: () => void;
  onRemove: () => void;
};

const CompactEntryRow = ({ entry, envName, onEdit, onRemove }: CompactEntryRowProps) => (
  <div className="flex items-center gap-2 px-3 py-2">
    <div className="flex flex-1 items-center gap-2">
      <Badge variant="neutral" className="gap-1.5">
        <Layers className="size-3" />
        {envName}
      </Badge>
      <ArrowRight className="size-3.5 shrink-0 text-muted" />
      <div className="flex items-center gap-1.5">
        <FolderIcon className="size-3.5 text-muted" />
        <span className="text-sm text-muted">
          {entry.secretPath === "/" ? "/" : entry.secretPath}
        </span>
      </div>
    </div>
    <div className="flex items-center gap-1">
      <IconButton variant="ghost-muted" size="xs" onClick={onEdit}>
        <Pencil />
      </IconButton>
      <IconButton variant="ghost-muted" size="xs" onClick={onRemove}>
        <Trash2 />
      </IconButton>
    </div>
  </div>
);

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  editData?: ShareSecretsEditData | null;
};

export const ShareSecretsSheet = ({ isOpen, onOpenChange, editData }: Props) => {
  const { currentProject } = useProject();
  const [entries, setEntries] = useState<SourceEntry[]>([{ ...EMPTY_ENTRY }]);
  const [editingIndex, setEditingIndex] = useState<number | null>(0);
  const [targetProjects, setTargetProjects] = useState<Project[]>([]);

  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { data: projects = [], isPending: isProjectsLoading } = useGetUserProjectsByType(
    ProjectType.SecretManager
  );

  const isEditMode = Boolean(editData);

  useEffect(() => {
    if (!isOpen) return;

    if (editData) {
      const initialEntries: SourceEntry[] = editData.grants.map((g) => ({
        environment: g.environmentSlug,
        secretPath: g.folderName === "root" ? "/" : `/${g.folderName}`
      }));
      setEntries(initialEntries.length > 0 ? initialEntries : [{ ...EMPTY_ENTRY }]);
      setEditingIndex(null);

      const matchingProject = projects.find((p) => p.id === editData.targetProjectId);
      if (matchingProject) {
        setTargetProjects([matchingProject]);
      }
    } else {
      setEntries([{ ...EMPTY_ENTRY }]);
      setEditingIndex(0);
      setTargetProjects([]);
    }
  }, [isOpen, editData, projects]);

  const availableProjects = projects.filter((p) => p.id !== currentProject.id);

  const hasValidEntry = entries.some((e) => e.environment && e.secretPath);

  const envNameBySlug = new Map(currentProject.environments.map((e) => [e.slug, e.name]));
  const isEntryFilled = (entry: SourceEntry) => Boolean(entry.environment);

  const compactEntries = entries
    .map((entry, originalIndex) => ({ entry, originalIndex }))
    .filter(({ entry, originalIndex }) => originalIndex !== editingIndex && isEntryFilled(entry));

  const handleEntryChange = (index: number, updated: Partial<SourceEntry>) => {
    setEntries((prev) => prev.map((e, i) => (i === index ? { ...e, ...updated } : e)));
  };

  const handleEntryRemove = (index: number) => {
    setEntries((prev) => {
      const next = prev.filter((_, i) => i !== index);
      if (next.length === 0) return [{ ...EMPTY_ENTRY }];
      return next;
    });
    setEditingIndex((prev) => {
      if (prev === null) return null;
      if (index < prev) return prev - 1;
      if (index === prev) return null;
      return prev;
    });
  };

  const handleAddEntry = () => {
    setEntries((prev) => [...prev, { ...EMPTY_ENTRY }]);
    setEditingIndex(entries.length);
  };

  const postGrant = async (dto: TCreateProjectFolderGrantDTO) => {
    try {
      await apiRequest.post("/api/v1/project-folder-grants", dto);
    } catch (err) {
      if (
        axios.isAxiosError(err) &&
        typeof err.response?.data?.message === "string" &&
        (err.response.data.message as string).includes("already exists")
      ) {
        return;
      }
      throw err;
    }
  };

  const removeGrant = async (dto: TDeleteProjectFolderGrantDTO) => {
    await apiRequest.delete(`/api/v1/project-folder-grants/${dto.grantId}`, {
      params: { sourceProjectId: dto.sourceProjectId }
    });
  };

  const handleSubmit = async () => {
    const validEntries = entries.filter((e) => e.environment && e.secretPath);
    if (validEntries.length === 0 || (!isEditMode && targetProjects.length === 0)) return;

    setIsSubmitting(true);
    try {
      const operations: Promise<void>[] = [];

      if (editData) {
        const currentKeys = new Set(validEntries.map(entryKey));
        const originalKeys = new Set(
          editData.grants.map((g) =>
            entryKey({
              environment: g.environmentSlug,
              secretPath: g.folderName === "root" ? "/" : `/${g.folderName}`
            })
          )
        );

        editData.grants.forEach((g) => {
          const key = entryKey({
            environment: g.environmentSlug,
            secretPath: g.folderName === "root" ? "/" : `/${g.folderName}`
          });
          if (!currentKeys.has(key)) {
            operations.push(removeGrant({ grantId: g.id, sourceProjectId: currentProject.id }));
          }
        });

        validEntries.forEach((entry) => {
          if (!originalKeys.has(entryKey(entry))) {
            operations.push(
              postGrant({
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
            operations.push(
              postGrant({
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

      await queryClient.invalidateQueries({
        queryKey: projectFolderGrantKeys.listByProject(currentProject.id)
      });
      const targetProjectIds = isEditMode
        ? [editData!.targetProjectId]
        : targetProjects.map((p) => p.id);
      await Promise.all(
        targetProjectIds.map((id) =>
          queryClient.invalidateQueries({
            queryKey: projectFolderGrantKeys.listReceived(id)
          })
        )
      );

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
            <p className="text-xs font-semibold tracking-widest text-muted uppercase">
              From This Project
            </p>

            {compactEntries.length > 0 && (
              <Card className="gap-0 divide-y divide-border p-0">
                {compactEntries.map(({ entry, originalIndex }) => (
                  <CompactEntryRow
                    key={originalIndex}
                    entry={entry}
                    envName={envNameBySlug.get(entry.environment) ?? entry.environment}
                    onEdit={() => setEditingIndex(originalIndex)}
                    onRemove={() => handleEntryRemove(originalIndex)}
                  />
                ))}
              </Card>
            )}

            {editingIndex !== null && entries[editingIndex] && (
              <SourceEntryRow
                entry={entries[editingIndex]}
                index={editingIndex}
                environments={currentProject.environments}
                onChange={handleEntryChange}
              />
            )}

            <Button variant="outline" size="sm" className="w-fit" onClick={handleAddEntry}>
              <Plus className="size-3.5" />
              Add another path
            </Button>

            <div className="rounded-md border border-border p-4">
              <p className="mb-4 text-xs font-semibold tracking-widest text-muted uppercase">
                To Another Project
              </p>

              <Field>
                <FieldLabel>Target projects</FieldLabel>
                {isEditMode ? (
                  <div className="flex items-center gap-2 rounded-md border border-border px-3 py-2">
                    <Badge variant="project" className="gap-1.5">
                      <Box className="size-3" />
                      {editData!.targetProjectName}
                    </Badge>
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
