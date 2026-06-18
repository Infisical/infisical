import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangle, Search } from "lucide-react";

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
  SelectTrigger,
  SelectValue
} from "@app/components/v3/generic/Select";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from "@app/components/v3/generic/Sheet";
import { TextArea } from "@app/components/v3/generic/TextArea";
import {
  PamAccountType,
  useCreatePamAccount,
  useListPamAccountTemplates,
  useListPamAccountTypes,
  useListPamFoldersAdmin,
  usePamAccountTypeMap
} from "@app/hooks/api/pam";

import { AccountPlatformIcon } from "../../PamAccessPage/components/AccountPlatformIcon";
import {
  accountFormSchema,
  areRequiredFieldsFilled,
  buildDefaultFieldValues,
  TAccountFormValues
} from "./accountFormSchema";
import { ConnectionDetailsForm } from "./ConnectionDetailsForm";
import { CredentialsForm } from "./CredentialsForm";

type Props = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  defaultFolderId?: string;
};

export const CreateAccountSheet = ({ isOpen, onOpenChange, defaultFolderId }: Props) => {
  const createAccount = useCreatePamAccount();

  const [step, setStep] = useState<1 | 2>(1);
  const [templateSearch, setTemplateSearch] = useState("");
  const [confirmDiscardOpen, setConfirmDiscardOpen] = useState(false);

  const {
    control,
    handleSubmit,
    reset,
    watch,
    setValue,
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
    }
  }, [isOpen, defaultFolderId, reset]);

  // The chosen template fixes the account type; seed the type + its field defaults from metadata
  useEffect(() => {
    if (!selectedMetadata) return;
    setValue("accountType", selectedMetadata.type);
    setValue("connectionDetails", buildDefaultFieldValues(selectedMetadata.connectionFields));
    setValue("credentials", buildDefaultFieldValues(selectedMetadata.credentialFields));
  }, [selectedMetadata?.type, setValue]);

  const canProceed = Boolean(selectedFolderId && selectedTemplateId);

  const onSubmit = (values: TAccountFormValues) => {
    if (!selectedMetadata) return;

    if (!areRequiredFieldsFilled(selectedMetadata.connectionFields, values.connectionDetails)) {
      createNotification({ text: "Check connection details fields", type: "error" });
      return;
    }
    if (!areRequiredFieldsFilled(selectedMetadata.credentialFields, values.credentials)) {
      createNotification({ text: "Check credentials fields", type: "error" });
      return;
    }

    createAccount.mutate(
      {
        accountType: values.accountType,
        name: values.name,
        description: values.description || undefined,
        folderId: values.folderId,
        templateId: values.templateId,
        connectionDetails: values.connectionDetails,
        credentials: values.credentials
      },
      {
        onSuccess: () => {
          createNotification({ text: "Account created", type: "success" });
          onOpenChange(false);
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
          </SheetHeader>

          {step === 1 ? (
            <>
              <div className="flex min-h-0 flex-1 flex-col gap-5 px-4">
                <Controller
                  control={control}
                  name="folderId"
                  render={({ field }) => (
                    <Field>
                      <FieldLabel>
                        Folder<span className="text-product-pam">*</span>
                      </FieldLabel>
                      <FieldContent>
                        <Select value={field.value} onValueChange={field.onChange}>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Select folder" />
                          </SelectTrigger>
                          <SelectContent position="popper">
                            {folders.map((folder) => (
                              <SelectItem key={folder.id} value={folder.id}>
                                {folder.name}
                              </SelectItem>
                            ))}
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
                      <FieldLabel>
                        Account Template<span className="text-product-pam">*</span>
                      </FieldLabel>
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
              <div className="flex thin-scrollbar flex-1 flex-col gap-4 overflow-y-auto px-4">
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
                  render={({ field }) => (
                    <Field>
                      <FieldLabel>Description</FieldLabel>
                      <FieldContent>
                        <TextArea {...field} placeholder="Optional description" rows={2} />
                      </FieldContent>
                    </Field>
                  )}
                />

                <div className="mt-2">
                  <h3 className="mb-3 text-sm font-medium text-foreground">Connection Details</h3>
                  <ConnectionDetailsForm control={control} />
                </div>

                <div className="mt-2">
                  <h3 className="mb-3 text-sm font-medium text-foreground">Credentials</h3>
                  <CredentialsForm control={control} />
                </div>
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
    </>
  );
};
