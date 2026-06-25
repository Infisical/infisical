import { useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AxiosError } from "axios";
import { FileInput, Key, Share2 } from "lucide-react";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { SecretPathInput } from "@app/components/v3";
import {
  Button,
  Card,
  CardDescription,
  CardTitle,
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
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

  const [step, setStep] = useState<1 | 2>(1);
  const [importSource, setImportSource] = useState<ImportSource | null>(null);

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
    setStep(1);
    setImportSource(null);
    setSelectedSourceProjectId(null);
    setSelectedEnvironmentSlug(null);
    setSelectedFolderName(null);
    onClose();
  };

  const handleToggle = (open: boolean) => {
    if (!open) handleClose();
    else onTogglePopUp(open);
  };

  const handleSourceSelect = (source: ImportSource) => {
    setImportSource(source);
    setStep(2);
  };

  const handleBack = () => {
    setStep(1);
    setImportSource(null);
    setSelectedSourceProjectId(null);
    setSelectedEnvironmentSlug(null);
    setSelectedFolderName(null);
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

  const effectiveStep = showSourceStep ? step : 2;
  const effectiveImportSource: ImportSource = showSourceStep
    ? (importSource ?? "this-project")
    : "this-project";

  const renderStep1 = () => (
    <>
      <DialogDescription>
        Choose where to bring secrets in from. Imports stay in sync with their source.
      </DialogDescription>
      <div className="grid grid-cols-2 gap-4">
        <button
          type="button"
          onClick={() => handleSourceSelect("this-project")}
          className="block w-full text-left"
        >
          <Card className="gap-3 transition-colors hover:bg-mineshaft-700">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-900/40">
              <FileInput className="size-5 text-blue-400" />
            </div>
            <div>
              <CardTitle className="text-base">This Project</CardTitle>
              <CardDescription className="mt-1">
                Inherit secrets from another environment or folder within{" "}
                {currentProject?.name ?? "this project"}.
              </CardDescription>
            </div>
          </Card>
        </button>

        <button
          type="button"
          onClick={() => handleSourceSelect("another-project")}
          className="block w-full text-left"
        >
          <Card className="gap-3 transition-colors hover:bg-mineshaft-700">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-yellow-900/40">
              <Share2 className="size-5 text-yellow-400" />
            </div>
            <div>
              <CardTitle className="text-base">Another Project</CardTitle>
              <CardDescription className="mt-1">
                Import secrets that a different project has shared with this one.
              </CardDescription>
            </div>
          </Card>
        </button>
      </div>
    </>
  );

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
        <Button type="button" variant="ghost" onClick={showSourceStep ? handleBack : handleClose}>
          {showSourceStep ? "Back" : "Cancel"}
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
        <DialogDescription>
          Other projects have made these secret sets available to{" "}
          {currentProject?.name ?? "this project"}. Select one to import.
        </DialogDescription>

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
          <div className="flex items-center gap-3 rounded-lg border border-border bg-popover p-4">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-mineshaft-700">
              <Key className="size-4 text-yellow-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">
                <span className="text-yellow-400">{selectedGrant.secretCount} secrets</span> will be
                imported
              </p>
              <p className="mt-0.5 text-xs text-accent">
                {selectedGrant.sourceProjectName} &middot; {selectedGrant.environmentName} &middot;{" "}
                {selectedGrant.folderName === "root" ? "/" : `/${selectedGrant.folderName}`}
              </p>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={handleBack}>
            Back
          </Button>
          <Button
            type="button"
            variant="project"
            isDisabled={!selectedGrant}
            isLoading={isCreatingImport}
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
                    path:
                      selectedGrant.folderName === "root" ? "/" : `/${selectedGrant.folderName}`
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
        </DialogHeader>
        {effectiveStep === 1 && renderStep1()}
        {effectiveStep === 2 && effectiveImportSource === "this-project" && renderThisProjectForm()}
        {effectiveStep === 2 &&
          effectiveImportSource === "another-project" &&
          renderAnotherProjectForm()}
      </DialogContent>
    </Dialog>
  );
};
