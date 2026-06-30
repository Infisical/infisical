import { useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AxiosError } from "axios";
import { InfoIcon, Key } from "lucide-react";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
  FilterableSelect,
  Item,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
  SecretPathInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { useOrganization, useProject, useSubscription } from "@app/context";
import { useCreateSecretImport } from "@app/hooks/api";
import { useListProjectGrantsReceived } from "@app/hooks/api/projectGrants";

const typeSchema = z.object({
  environment: z.object({ name: z.string(), slug: z.string() }),
  secretPath: z
    .string()
    .trim()
    .transform((val) =>
      typeof val === "string" && val.at(-1) === "/" && val.length > 1 ? val.slice(0, -1) : val
    ),
  isReplication: z.boolean().default(false)
});

type TFormSchema = z.infer<typeof typeSchema>;

type ImportSource = "this-project" | "another-project";

type Props = {
  environment: string;
  projectId: string;
  secretPath?: string;
  isOpen?: boolean;
  onClose: () => void;
  onTogglePopUp: (isOpen: boolean) => void;
  onUpgradePlan: () => void;
};

export const CreateSecretImportForm = ({
  environment,
  projectId,
  secretPath = "/",
  isOpen,
  onClose,
  onTogglePopUp,
  onUpgradePlan
}: Props) => {
  const {
    handleSubmit,
    control,
    reset,
    watch,
    formState: { isSubmitting, errors }
  } = useForm<TFormSchema>({ resolver: zodResolver(typeSchema) });

  const { currentProject } = useProject();
  const { currentOrg } = useOrganization();
  const environments = currentProject?.environments || [];
  const selectedEnvironment = watch("environment");
  const { subscription } = useSubscription();

  const { mutateAsync: createSecretImport, isPending: isCreatingImport } = useCreateSecretImport();

  const { data: receivedGrants = [] } = useListProjectGrantsReceived(
    currentOrg?.allowCrossProjectSecretSharing ? projectId : ""
  );

  const showSourceStep = receivedGrants.length > 0;

  const [importSource, setImportSource] = useState<ImportSource>("this-project");

  const [selectedSourceProjectId, setSelectedSourceProjectId] = useState<string | null>(null);
  const [selectedEnvironmentSlug, setSelectedEnvironmentSlug] = useState<string | null>(null);
  const [selectedFolderName, setSelectedFolderName] = useState<string | null>(null);

  const uniqueSourceProjects = useMemo(() => {
    const seen = new Set<string>();
    return receivedGrants.filter((g) => {
      if (seen.has(g.sourceProjectId)) return false;
      seen.add(g.sourceProjectId);
      return true;
    });
  }, [receivedGrants]);

  const grantsForSelectedProject = useMemo(
    () => receivedGrants.filter((g) => g.sourceProjectId === selectedSourceProjectId),
    [receivedGrants, selectedSourceProjectId]
  );

  const uniqueEnvironmentsForProject = useMemo(() => {
    const seen = new Set<string>();
    return grantsForSelectedProject.filter((g) => {
      if (seen.has(g.environmentSlug)) return false;
      seen.add(g.environmentSlug);
      return true;
    });
  }, [grantsForSelectedProject]);

  const grantsForSelectedEnv = useMemo(
    () => grantsForSelectedProject.filter((g) => g.environmentSlug === selectedEnvironmentSlug),
    [grantsForSelectedProject, selectedEnvironmentSlug]
  );

  const selectedGrant = useMemo(
    () => grantsForSelectedEnv.find((g) => g.folderName === selectedFolderName) ?? null,
    [grantsForSelectedEnv, selectedFolderName]
  );

  const handleClose = () => {
    reset();
    setImportSource("this-project");
    setSelectedSourceProjectId(null);
    setSelectedEnvironmentSlug(null);
    setSelectedFolderName(null);
    onClose();
  };

  const handleToggle = (open: boolean) => {
    if (!open) handleClose();
    else onTogglePopUp(open);
  };

  const handleFormSubmit = async ({
    environment: importedEnv,
    secretPath: importedSecPath,
    isReplication
  }: TFormSchema) => {
    try {
      if (isReplication && !subscription?.secretApproval) {
        onUpgradePlan();
        return;
      }

      await createSecretImport({
        environment,
        projectId,
        path: secretPath,
        isReplication,
        import: {
          environment: importedEnv.slug,
          path: importedSecPath
        }
      });
      handleClose();
      createNotification({
        type: "success",
        text: `Successfully linked. ${isReplication ? "Please refresh the dashboard to view changes" : ""}`
      });
    } catch (err) {
      console.error(err);
      const axiosError = err as AxiosError;
      if (axiosError?.response?.status === 401) {
        createNotification({
          text: "You do not have access to the selected environment/path",
          type: "error"
        });
      }
    }
  };

  const renderThisProjectForm = () => (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
      <Controller
        control={control}
        name="environment"
        render={({ field }) => {
          const selectedItem = environments.find((e) => e.slug === field.value?.slug);
          return (
            <Field>
              <FieldLabel>Environment</FieldLabel>
              <FieldContent>
                <FilterableSelect
                  options={environments}
                  getOptionLabel={(option) => option.name}
                  getOptionValue={(option) => option.slug}
                  placeholder="Select environment..."
                  value={selectedItem || null}
                  onChange={(newValue) => {
                    const single = Array.isArray(newValue) ? newValue[0] : newValue;
                    field.onChange(single || null);
                  }}
                />
              </FieldContent>
              <FieldError>{errors.environment?.message}</FieldError>
            </Field>
          );
        }}
      />
      <Controller
        control={control}
        name="secretPath"
        defaultValue="/"
        render={({ field }) => (
          <Field>
            <FieldLabel>Secret Path</FieldLabel>
            <FieldContent>
              <SecretPathInput {...field} environment={selectedEnvironment?.slug} />
            </FieldContent>
            <FieldError>{errors.secretPath?.message}</FieldError>
          </Field>
        )}
      />
      <Controller
        name="isReplication"
        control={control}
        defaultValue={false}
        render={({ field: { value, onChange } }) => (
          <Field>
            <FieldContent>
              <Select
                value={value ? "true" : "false"}
                onValueChange={(val) => onChange(val === "true")}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="false">Ignore secret approval policies</SelectItem>
                  <SelectItem value="true">Respect secret approval policies</SelectItem>
                </SelectContent>
              </Select>
            </FieldContent>
            <FieldDescription>
              {value
                ? "Secrets from the source will be automatically sent to the destination. If approval policies exist at the destination, the secrets will be sent as approval requests instead of being applied immediately."
                : "Secrets from the source location will be imported to the selected destination immediately, ignoring any approval policies at the destination."}
            </FieldDescription>
          </Field>
        )}
      />
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={handleClose}>
          Cancel
        </Button>
        <Button type="submit" variant="project" isPending={isSubmitting} isDisabled={isSubmitting}>
          Create Import
        </Button>
      </DialogFooter>
    </form>
  );

  const renderAnotherProjectForm = () => {
    const sourceProjectOptions = uniqueSourceProjects.map((g) => ({
      label: g.sourceProjectName,
      value: g.sourceProjectId
    }));

    const environmentOptions = uniqueEnvironmentsForProject.map((g) => ({
      label: g.environmentName,
      value: g.environmentSlug
    }));

    const folderOptions = grantsForSelectedEnv.map((g) => ({
      label: g.folderName === "root" ? "/" : `/${g.folderName}`,
      value: g.folderName
    }));

    return (
      <div className="space-y-4">
        <Field>
          <FieldLabel>Project</FieldLabel>
          <FieldContent>
            <FilterableSelect
              options={sourceProjectOptions}
              getOptionLabel={(o) => o.label}
              getOptionValue={(o) => o.value}
              placeholder="Select project..."
              value={
                selectedSourceProjectId
                  ? (sourceProjectOptions.find((o) => o.value === selectedSourceProjectId) ?? null)
                  : null
              }
              onChange={(newValue) => {
                const single = Array.isArray(newValue) ? newValue[0] : newValue;
                setSelectedSourceProjectId(single && "value" in single ? single.value : null);
                setSelectedEnvironmentSlug(null);
                setSelectedFolderName(null);
              }}
            />
          </FieldContent>
        </Field>

        <Field>
          <FieldLabel>Environment</FieldLabel>
          <FieldContent>
            <FilterableSelect
              options={environmentOptions}
              getOptionLabel={(o) => o.label}
              getOptionValue={(o) => o.value}
              placeholder="Select environment..."
              isDisabled={!selectedSourceProjectId}
              value={
                selectedEnvironmentSlug
                  ? (environmentOptions.find((o) => o.value === selectedEnvironmentSlug) ?? null)
                  : null
              }
              onChange={(newValue) => {
                const single = Array.isArray(newValue) ? newValue[0] : newValue;
                setSelectedEnvironmentSlug(single && "value" in single ? single.value : null);
                setSelectedFolderName(null);
              }}
            />
          </FieldContent>
        </Field>

        <Field>
          <FieldLabel>Folder path</FieldLabel>
          <FieldContent>
            <FilterableSelect
              options={folderOptions}
              getOptionLabel={(o) => o.label}
              getOptionValue={(o) => o.value}
              placeholder="Select folder..."
              isDisabled={!selectedEnvironmentSlug}
              value={
                selectedFolderName
                  ? (folderOptions.find((o) => o.value === selectedFolderName) ?? null)
                  : null
              }
              onChange={(newValue) => {
                const single = Array.isArray(newValue) ? newValue[0] : newValue;
                setSelectedFolderName(single && "value" in single ? single.value : null);
              }}
            />
          </FieldContent>
        </Field>

        {selectedGrant && (
          <Item variant="outline">
            <ItemMedia className="flex h-9 w-9 items-center justify-center rounded-md bg-mineshaft-700">
              <Key className="size-4 text-yellow-400" />
            </ItemMedia>
            <ItemContent>
              <ItemTitle>
                <span className="text-yellow-400">{selectedGrant.secretCount} secrets</span> will be
                imported
              </ItemTitle>
              <ItemDescription>
                {selectedGrant.sourceProjectName} &middot; {selectedGrant.environmentName} &middot;{" "}
                {selectedGrant.folderName === "root" ? "/" : `/${selectedGrant.folderName}`}
              </ItemDescription>
            </ItemContent>
          </Item>
        )}

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="project"
            isDisabled={!selectedGrant}
            isPending={isCreatingImport}
            onClick={async () => {
              if (!selectedGrant) return;
              try {
                await createSecretImport({
                  environment,
                  projectId,
                  path: secretPath,
                  import: {
                    sourceProjectId: selectedGrant.sourceProjectId,
                    environment: selectedGrant.environmentSlug,
                    path: selectedGrant.folderName === "root" ? "/" : `/${selectedGrant.folderName}`
                  }
                });
                handleClose();
                createNotification({ type: "success", text: "Successfully linked secrets." });
              } catch (err) {
                console.error(err);
                const axiosError = err as AxiosError;
                if (axiosError?.response?.status === 401) {
                  createNotification({
                    text: "You do not have access to the selected environment/path",
                    type: "error"
                  });
                }
              }
            }}
          >
            Create Import
          </Button>
        </DialogFooter>
      </div>
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleToggle}>
      <DialogContent className="max-w-lg overflow-visible">
        <DialogHeader>
          <DialogTitle>Add Secret Import</DialogTitle>
          <DialogDescription>
            Import secrets from this project or from another project that has granted you access.
          </DialogDescription>
        </DialogHeader>
        {showSourceStep ? (
          <Tabs
            value={importSource}
            onValueChange={(val) => {
              setImportSource(val as ImportSource);
              setSelectedSourceProjectId(null);
              setSelectedEnvironmentSlug(null);
              setSelectedFolderName(null);
            }}
          >
            <div className="mx-auto flex items-center gap-2">
              <TabsList className="w-fit">
                <TabsTrigger value="this-project">This Project</TabsTrigger>
                <TabsTrigger value="another-project">Another Project</TabsTrigger>
              </TabsList>
              <Tooltip>
                <TooltipTrigger>
                  <InfoIcon size={16} className="text-mineshaft-400" />
                </TooltipTrigger>
                <TooltipContent side="right" align="start" className="max-w-sm">
                  <p className="mb-2 text-mineshaft-300">
                    You can import secrets into your project in one of two ways:
                  </p>
                  <ul className="ml-3.5 flex list-disc flex-col gap-y-4">
                    <li className="text-mineshaft-200">
                      <strong className="font-medium text-mineshaft-100">This Project</strong> —
                      Inherit secrets from another environment or folder within{" "}
                      <strong className="font-medium text-mineshaft-100">
                        {currentProject?.name ?? "this project"}
                      </strong>
                      .
                      <p className="mt-2">
                        Recommended when you want to reuse secrets across environments or folders in
                        the same project.
                      </p>
                    </li>
                    <li className="text-mineshaft-200">
                      <strong className="font-medium text-mineshaft-100">Another Project</strong> —
                      Import a folder or environment from a different project that has granted
                      access to this one.
                      <p className="mt-2">
                        Recommended when secrets are managed centrally and shared across multiple
                        projects.
                      </p>
                    </li>
                  </ul>
                </TooltipContent>
              </Tooltip>
            </div>
            <TabsContent value="this-project">{renderThisProjectForm()}</TabsContent>
            <TabsContent value="another-project">{renderAnotherProjectForm()}</TabsContent>
          </Tabs>
        ) : (
          renderThisProjectForm()
        )}
      </DialogContent>
    </Dialog>
  );
};
