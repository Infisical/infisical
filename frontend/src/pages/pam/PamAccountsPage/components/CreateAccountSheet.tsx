import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, ArrowUpRight, Plus, Search } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { HighlightText } from "@app/components/v2/HighlightText";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  GatewayPicker,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  RadioGroup,
  RadioGroupItem
} from "@app/components/v3";
import { Button } from "@app/components/v3/generic/Button";
import { Field, FieldContent, FieldError, FieldLabel } from "@app/components/v3/generic/Field";
import { Input } from "@app/components/v3/generic/Input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue
} from "@app/components/v3/generic/Select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from "@app/components/v3/generic/Sheet";
import { TextArea } from "@app/components/v3/generic/TextArea";
import { useOrganization } from "@app/context";
import {
  accountTypeRequiresRecording,
  PamAccountType,
  useCreatePamAccount,
  useGetPamAccessCapabilities,
  useListPamAccountTemplates,
  useListPamAccountTypes,
  useListPamFoldersAdmin,
  usePamAccountTypeMap
} from "@app/hooks/api/pam";

import { AccountPlatformIcon } from "../../PamAccessPage/components/AccountPlatformIcon";
import {
  accountFormSchema,
  applyServerValidationErrors,
  buildDefaultFieldValues,
  getMissingRequiredFields,
  TAccountFormValues
} from "./accountFormSchema";
import { ConnectionDetailsForm } from "./ConnectionDetailsForm";
import { CreateFolderModal } from "./CreateFolderModal";
import { CredentialsForm } from "./CredentialsForm";
import { SshCaSetupCallout } from "./SshCaSetupCallout";

const CREATE_FOLDER_VALUE = "__create_folder__";

type Props = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  defaultFolderId?: string;
  onCreated?: (accountId: string) => void;
};

export const CreateAccountSheet = ({ isOpen, onOpenChange, defaultFolderId, onCreated }: Props) => {
  const createAccount = useCreatePamAccount();

  const { currentOrg } = useOrganization();
  const { data: capabilities } = useGetPamAccessCapabilities();
  const isProductAdmin = Boolean(capabilities?.isProductAdmin);

  const [step, setStep] = useState<1 | 2>(1);
  const [templateSearch, setTemplateSearch] = useState("");
  const [confirmDiscardOpen, setConfirmDiscardOpen] = useState(false);
  const [createFolderOpen, setCreateFolderOpen] = useState(false);

  // Gateway/recording are collected inline only when the chosen template doesn't already provide them
  const [gateway, setGateway] = useState<{
    gatewayId: string | null;
    gatewayPoolId: string | null;
  }>({ gatewayId: null, gatewayPoolId: null });
  const [gatewayError, setGatewayError] = useState(false);

  const {
    control,
    handleSubmit,
    reset,
    watch,
    setValue,
    setError,
    clearErrors,
    formState: { isDirty }
  } = useForm<TAccountFormValues>({
    resolver: zodResolver(accountFormSchema),
    defaultValues: {
      accountType: PamAccountType.Postgres,
      name: "",
      description: "",
      folderId: "",
      templateId: "",
      connectionDetails: {},
      credentials: {}
    }
  });

  const selectedFolderId = watch("folderId");
  const selectedTemplateId = watch("templateId");

  const { data: accountTypes = [] } = useListPamAccountTypes();
  const { data: folders = [] } = useListPamFoldersAdmin();
  const { data: templates = [] } = useListPamAccountTemplates();
  const { map: accountTypeMap } = usePamAccountTypeMap();

  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId);
  const selectedMetadata = accountTypes.find((t) => t.type === selectedTemplate?.type);

  const needsGateway = Boolean(
    selectedMetadata?.requiresGateway !== false &&
      selectedTemplate &&
      !selectedTemplate.gatewayId &&
      !selectedTemplate.gatewayPoolId
  );
  const needsRecording = Boolean(
    selectedTemplate &&
      accountTypeRequiresRecording(selectedTemplate.type) &&
      !selectedTemplate.recordingConnectionId
  );

  const templateQuery = templateSearch.trim().toLowerCase();
  const filteredTemplates = templates.filter((tpl) => {
    if (!templateQuery) return true;
    const typeName = accountTypeMap[tpl.type]?.name ?? tpl.type;
    return `${tpl.name} ${tpl.description ?? ""} ${tpl.type} ${typeName}`
      .toLowerCase()
      .includes(templateQuery);
  });

  // Reset everything to a fresh state when the sheet (re)opens, honoring a pre-filled folder
  useEffect(() => {
    if (isOpen) {
      reset({
        accountType: PamAccountType.Postgres,
        name: "",
        description: "",
        folderId: defaultFolderId ?? "",
        templateId: "",
        connectionDetails: {},
        credentials: {}
      });
      setStep(1);
      setTemplateSearch("");
      setGateway({ gatewayId: null, gatewayPoolId: null });
      setGatewayError(false);
    }
  }, [isOpen, defaultFolderId, reset]);

  // The chosen template fixes the account type; seed the type + its field defaults from metadata
  useEffect(() => {
    if (!selectedMetadata) return;
    setValue("accountType", selectedMetadata.type);
    setValue("connectionDetails", buildDefaultFieldValues(selectedMetadata.connectionFields));
    setValue("credentials", buildDefaultFieldValues(selectedMetadata.credentialFields));
    setGateway({ gatewayId: null, gatewayPoolId: null });
    setGatewayError(false);
  }, [selectedMetadata?.type, selectedTemplateId, setValue]);

  const canProceed = Boolean(selectedFolderId && selectedTemplateId);

  const onSubmit = (values: TAccountFormValues) => {
    if (!selectedMetadata) return;

    clearErrors();
    const missingConnection = getMissingRequiredFields(
      selectedMetadata.connectionFields,
      values.connectionDetails
    );
    const missingCredentials = getMissingRequiredFields(
      selectedMetadata.credentialFields,
      values.credentials
    );
    const gatewayMissing = needsGateway && !gateway.gatewayId && !gateway.gatewayPoolId;
    setGatewayError(gatewayMissing);

    if (missingConnection.length || missingCredentials.length || gatewayMissing) {
      missingConnection.forEach((key) =>
        setError(`connectionDetails.${key}`, {
          type: "required",
          message: "This field is required"
        })
      );
      missingCredentials.forEach((key) =>
        setError(`credentials.${key}`, { type: "required", message: "This field is required" })
      );
      return;
    }

    const knownFields = new Set<string>([
      "name",
      "description",
      "folderId",
      "templateId",
      ...selectedMetadata.connectionFields.map((f) => `connectionDetails.${f.key}`),
      ...selectedMetadata.credentialFields.map((f) => `credentials.${f.key}`)
    ]);

    createAccount.mutate(
      {
        accountType: values.accountType,
        name: values.name,
        description: values.description || undefined,
        folderId: values.folderId,
        templateId: values.templateId,
        connectionDetails: values.connectionDetails,
        credentials: values.credentials,
        ...(gateway.gatewayId ? { gatewayId: gateway.gatewayId } : {}),
        ...(gateway.gatewayPoolId ? { gatewayPoolId: gateway.gatewayPoolId } : {})
      },
      {
        onSuccess: (account: { id: string }) => {
          createNotification({ text: "Account created", type: "success" });
          onOpenChange(false);
          onCreated?.(account.id);
        },
        onError: (error) => {
          const unmapped = applyServerValidationErrors(error, setError, knownFields);
          if (unmapped.length) {
            createNotification({
              type: "error",
              title: "Validation Error",
              text: unmapped.join(", ")
            });
          }
        }
      }
    );
  };

  // Warn before discarding a partially filled form
  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && isDirty) {
      setConfirmDiscardOpen(true);
      return;
    }
    onOpenChange(nextOpen);
  };

  return (
    <>
      <Sheet open={isOpen} onOpenChange={handleOpenChange}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Add Account</SheetTitle>
            <SheetDescription>
              Pick a folder and an account template. The account inherits its type and governance
              rules from the selected template.
            </SheetDescription>
          </SheetHeader>

          {step === 1 ? (
            <>
              <div className="flex min-h-0 flex-1 flex-col gap-5 px-4 pt-3">
                <Controller
                  control={control}
                  name="folderId"
                  render={({ field }) => (
                    <Field>
                      <FieldLabel>
                        Folder<span className="text-product-pam">*</span>
                      </FieldLabel>
                      <FieldContent>
                        <Select
                          value={field.value}
                          onValueChange={(val) => {
                            if (val === CREATE_FOLDER_VALUE) {
                              setCreateFolderOpen(true);
                              return;
                            }
                            field.onChange(val);
                          }}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Select folder" />
                          </SelectTrigger>
                          <SelectContent position="popper">
                            {folders.map((folder) => (
                              <SelectItem key={folder.id} value={folder.id}>
                                {folder.name}
                              </SelectItem>
                            ))}
                            {folders.length > 0 && <SelectSeparator />}
                            <SelectItem value={CREATE_FOLDER_VALUE}>
                              <span className="flex items-center gap-1.5 text-muted">
                                <Plus className="size-4" />
                                Create folder
                              </span>
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </FieldContent>
                    </Field>
                  )}
                />

                <Controller
                  control={control}
                  name="templateId"
                  render={({ field }) => (
                    <Field className="min-h-0 flex-1">
                      <div className="flex items-center justify-between">
                        <FieldLabel>
                          Account Template<span className="text-product-pam">*</span>
                        </FieldLabel>
                        {isProductAdmin && (
                          <Button
                            variant="ghost"
                            size="xs"
                            className="text-muted hover:text-foreground"
                            asChild
                          >
                            <Link
                              to="/organizations/$orgId/pam/templates"
                              params={{ orgId: currentOrg.id }}
                              target="_blank"
                            >
                              Manage Templates
                              <ArrowUpRight />
                            </Link>
                          </Button>
                        )}
                      </div>
                      <FieldContent className="min-h-0 flex-1">
                        <InputGroup>
                          <InputGroupAddon align="inline-start">
                            <Search />
                          </InputGroupAddon>
                          <InputGroupInput
                            placeholder="Search templates..."
                            value={templateSearch}
                            onChange={(e) => setTemplateSearch(e.target.value)}
                          />
                        </InputGroup>
                        <RadioGroup
                          value={field.value}
                          onValueChange={field.onChange}
                          className="mt-2 flex thin-scrollbar flex-1 flex-col gap-2 overflow-y-auto"
                        >
                          {filteredTemplates.map((tpl) => {
                            const typeName = accountTypeMap[tpl.type]?.name ?? tpl.type;
                            const subtitle = tpl.description
                              ? `${typeName} • ${tpl.description}`
                              : typeName;
                            return (
                              <FieldLabel key={tpl.id} htmlFor={`tpl-${tpl.id}`} variant="pam">
                                <Field orientation="horizontal" className="items-center gap-3">
                                  <AccountPlatformIcon accountType={tpl.type} size={28} />
                                  <div className="min-w-0 flex-1 text-left">
                                    <p className="truncate text-sm font-medium text-foreground">
                                      <HighlightText text={tpl.name} highlight={templateSearch} />
                                    </p>
                                    <p className="truncate text-xs text-muted">
                                      <HighlightText text={subtitle} highlight={templateSearch} />
                                    </p>
                                  </div>
                                  <RadioGroupItem
                                    id={`tpl-${tpl.id}`}
                                    value={tpl.id}
                                    className="sr-only"
                                  />
                                </Field>
                              </FieldLabel>
                            );
                          })}
                          {filteredTemplates.length === 0 && (
                            <div className="rounded-md border border-border p-8 text-center text-sm text-muted">
                              {templates.length === 0
                                ? "No templates yet. Create one from the Account Templates page."
                                : "No templates match your search."}
                            </div>
                          )}
                        </RadioGroup>
                      </FieldContent>
                    </Field>
                  )}
                />
              </div>

              <SheetFooter className="justify-end border-t">
                <Button type="button" variant="ghost" onClick={() => handleOpenChange(false)}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="pam"
                  isDisabled={!canProceed}
                  onClick={() => setStep(2)}
                >
                  Next
                </Button>
              </SheetFooter>
            </>
          ) : (
            <form onSubmit={handleSubmit(onSubmit)} className="flex min-h-0 flex-1 flex-col">
              <div className="flex thin-scrollbar flex-1 flex-col gap-4 overflow-y-auto px-4 pt-3">
                {selectedTemplate && (
                  <div className="flex items-center gap-3 rounded-md border border-border bg-container p-3">
                    <AccountPlatformIcon accountType={selectedTemplate.type} size={28} />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">{selectedTemplate.name}</p>
                      <p className="truncate text-xs text-muted">
                        {accountTypeMap[selectedTemplate.type]?.name ?? selectedTemplate.type}
                        {selectedTemplate.description ? ` • ${selectedTemplate.description}` : ""}
                      </p>
                    </div>
                  </div>
                )}

                <Controller
                  control={control}
                  name="name"
                  render={({ field, fieldState }) => (
                    <Field>
                      <FieldLabel>
                        Name<span className="text-product-pam">*</span>
                      </FieldLabel>
                      <FieldContent>
                        <Input {...field} placeholder="My account" isError={!!fieldState.error} />
                        <FieldError>{fieldState.error?.message}</FieldError>
                      </FieldContent>
                    </Field>
                  )}
                />

                <Controller
                  control={control}
                  name="description"
                  render={({ field, fieldState }) => (
                    <Field>
                      <FieldLabel>Description</FieldLabel>
                      <FieldContent>
                        <TextArea
                          {...field}
                          placeholder="Optional description"
                          rows={2}
                          isError={!!fieldState.error}
                        />
                        <FieldError>{fieldState.error?.message}</FieldError>
                      </FieldContent>
                    </Field>
                  )}
                />

                <div className="mt-2">
                  <h3 className="mb-3 text-sm font-medium text-foreground">Connection Details</h3>
                  <div className="flex flex-col gap-4">
                    <ConnectionDetailsForm control={control} />
                    {needsGateway && (
                      <Field>
                        <FieldLabel>
                          Gateway<span className="text-product-pam">*</span>
                        </FieldLabel>
                        <FieldContent>
                          <GatewayPicker
                            value={gateway}
                            onChange={(value) => {
                              setGateway(value);
                              setGatewayError(false);
                            }}
                            isRequired
                            isError={gatewayError}
                          />
                          {gatewayError && <FieldError>A gateway is required</FieldError>}
                        </FieldContent>
                      </Field>
                    )}
                    {needsRecording && (
                      <div className="rounded-md border border-warning/40 bg-warning/5 p-3">
                        <div className="flex items-start gap-2">
                          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
                          <div className="text-sm">
                            <p className="font-medium text-warning">S3 recording not configured</p>
                            <p className="mt-1 text-muted">
                              This account will be created, but it will remain inaccessible until S3
                              recording is configured on the account or template.
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {(selectedMetadata?.credentialFields.length ?? 0) > 0 && (
                  <div className="mt-2">
                    <h3 className="mb-3 text-sm font-medium text-foreground">Credentials</h3>
                    <div className="flex flex-col gap-4">
                      <CredentialsForm control={control} />
                      <SshCaSetupCallout
                        accountType={watch("accountType")}
                        authMethod={watch("credentials")?.authMethod as string | undefined}
                      />
                    </div>
                  </div>
                )}

                <div aria-hidden className="h-8 shrink-0" />
              </div>

              <SheetFooter className="justify-end border-t">
                <Button type="button" variant="ghost" onClick={() => setStep(1)}>
                  Back
                </Button>
                <Button type="submit" variant="pam" isPending={createAccount.isPending}>
                  Create
                </Button>
              </SheetFooter>
            </form>
          )}
        </SheetContent>
      </Sheet>

      <AlertDialog open={confirmDiscardOpen} onOpenChange={setConfirmDiscardOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia>
              <AlertTriangle />
            </AlertDialogMedia>
            <AlertDialogTitle>Discard account setup?</AlertDialogTitle>
            <AlertDialogDescription>
              Your progress creating this account will be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Editing</AlertDialogCancel>
            <AlertDialogAction
              variant="danger"
              onClick={() => {
                setConfirmDiscardOpen(false);
                onOpenChange(false);
              }}
            >
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <CreateFolderModal
        isOpen={createFolderOpen}
        onOpenChange={setCreateFolderOpen}
        onCreated={(folderId) => setValue("folderId", folderId, { shouldDirty: true })}
      />
    </>
  );
};
