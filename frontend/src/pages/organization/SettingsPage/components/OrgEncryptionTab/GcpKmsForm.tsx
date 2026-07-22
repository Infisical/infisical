import { useEffect, useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { createNotification } from "@app/components/notifications";
import {
  Badge,
  Button,
  DialogFooter,
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FileDropzone,
  FilterableSelect,
  Input,
  SheetFooter
} from "@app/components/v3";
import { useOrganization } from "@app/context";
import {
  useAddExternalKms,
  useExternalKmsFetchGcpKeys,
  useUpdateExternalKms
} from "@app/hooks/api";
import {
  AddExternalKmsGcpFormSchema,
  AddExternalKmsGcpFormSchemaType,
  ExternalKmsGcpCredentialSchema,
  ExternalKmsGcpCredentialSchemaType,
  ExternalKmsProvider,
  Kms
} from "@app/hooks/api/kms/types";

type Props = {
  onCompleted: () => void;
  onCancel: () => void;
  kms?: Kms;
  mode?: "full" | "credentials" | "details";
  layout?: "dialog" | "sheet";
  secondaryActionLabel?: string;
};

type SelectOption = { label: string; value: string };

const GCP_REGIONS: SelectOption[] = [
  { label: "Johannesburg", value: "africa-south1" },
  { label: "Taiwan", value: "asia-east1" },
  { label: "Hong Kong", value: "asia-east2" },
  { label: "Tokyo", value: "asia-northeast1" },
  { label: "Osaka", value: "asia-northeast2" },
  { label: "Seoul", value: "asia-northeast3" },
  { label: "Mumbai", value: "asia-south1" },
  { label: "Delhi", value: "asia-south2" },
  { label: "Singapore", value: "asia-southeast1" },
  { label: "Jakarta", value: "asia-southeast2" },
  { label: "Sydney", value: "australia-southeast1" },
  { label: "Melbourne", value: "australia-southeast2" },
  { label: "Warsaw", value: "europe-central2" },
  { label: "Finland", value: "europe-north1" },
  { label: "Belgium", value: "europe-west1" },
  { label: "London", value: "europe-west2" },
  { label: "Frankfurt", value: "europe-west3" },
  { label: "Netherlands", value: "europe-west4" },
  { label: "Zurich", value: "europe-west6" },
  { label: "Milan", value: "europe-west8" },
  { label: "Paris", value: "europe-west9" },
  { label: "Berlin", value: "europe-west10" },
  { label: "Turin", value: "europe-west12" },
  { label: "Madrid", value: "europe-southwest1" },
  { label: "Doha", value: "me-central1" },
  { label: "Dammam", value: "me-central2" },
  { label: "Tel Aviv", value: "me-west1" },
  { label: "Montréal", value: "northamerica-northeast1" },
  { label: "Toronto", value: "northamerica-northeast2" },
  { label: "São Paulo", value: "southamerica-east1" },
  { label: "Santiago", value: "southamerica-west1" },
  { label: "Iowa", value: "us-central1" },
  { label: "South Carolina", value: "us-east1" },
  { label: "North Virginia", value: "us-east4" },
  { label: "Columbus", value: "us-east5" },
  { label: "Dallas", value: "us-south1" },
  { label: "Oregon", value: "us-west1" },
  { label: "Los Angeles", value: "us-west2" },
  { label: "Salt Lake City", value: "us-west3" },
  { label: "Las Vegas", value: "us-west4" }
];

const formatOptionLabel = ({ value, label }: SelectOption) => (
  <div className="flex w-full flex-row items-center justify-between gap-2">
    <span>{label}</span>
    <Badge variant="neutral">{value}</Badge>
  </div>
);

const filesToFileList = (files: File[]) => {
  const dataTransfer = new DataTransfer();
  files.forEach((file) => dataTransfer.items.add(file));
  return dataTransfer.files;
};

export const GcpKmsForm = ({
  onCompleted,
  onCancel,
  kms,
  mode = "full",
  layout = "dialog",
  secondaryActionLabel = "Cancel"
}: Props) => {
  const [isCredentialValid, setIsCredentialValid] = useState(false);
  const [credentialFiles, setCredentialFiles] = useState<File[]>([]);
  const [keys, setKeys] = useState<SelectOption[]>([]);
  const keyLookupRequestId = useRef(0);

  const {
    control,
    handleSubmit,
    setError,
    clearErrors,
    getValues,
    resetField,
    setValue,
    formState: { isSubmitting, isDirty }
  } = useForm<AddExternalKmsGcpFormSchemaType>({
    resolver: zodResolver(AddExternalKmsGcpFormSchema),
    defaultValues: {
      formType: kms ? "updateGcpKms" : "newGcpKms",
      name: kms?.name ?? "",
      description: kms?.description ?? "",
      gcpRegion: kms
        ? {
            label:
              GCP_REGIONS.find((region) => region.value === kms.externalKms.configuration.gcpRegion)
                ?.label ?? "",
            value: kms.externalKms.configuration.gcpRegion
          }
        : undefined,
      keyObject: undefined
    }
  });

  const { currentOrg, isSubOrganization } = useOrganization();
  const { mutateAsync: addGcpExternalKms } = useAddExternalKms(currentOrg.id);
  const { mutateAsync: updateGcpExternalKms } = useUpdateExternalKms(
    currentOrg.id,
    ExternalKmsProvider.Gcp
  );

  const { mutateAsync: fetchGcpKeys, isPending: isFetchGcpKeysLoading } =
    useExternalKmsFetchGcpKeys(currentOrg?.id);

  const getCredentialFileJson = async (
    files: FileList | undefined = getValues("credentialFile"),
    requestId?: number,
    shouldValidateMissingFile = true
  ): Promise<ExternalKmsGcpCredentialSchemaType | null> => {
    const isCurrentRequest = () =>
      requestId === undefined || requestId === keyLookupRequestId.current;
    const file = files?.[0];
    if (!file) {
      if (isCurrentRequest() && shouldValidateMissingFile) {
        setError("credentialFile", {
          message: "Service account credential JSON is required."
        });
      } else if (isCurrentRequest()) {
        clearErrors("credentialFile");
      }
      return null;
    }
    if (file.type !== "application/json") {
      if (isCurrentRequest()) {
        setError("credentialFile", {
          message: "Only .json files are accepted."
        });
      }
      return null;
    }

    try {
      const jsonContents = await file.text();
      const parsedJson = ExternalKmsGcpCredentialSchema.safeParse(JSON.parse(jsonContents));
      if (!parsedJson.success) {
        if (isCurrentRequest()) {
          setError("credentialFile", {
            message: "Invalid service account credential JSON."
          });
        }
        return null;
      }
      if (isCurrentRequest()) clearErrors("credentialFile");
      return parsedJson.data;
    } catch {
      if (isCurrentRequest()) {
        setError("credentialFile", {
          message: "Invalid service account credential JSON."
        });
      }
      return null;
    }
  };

  const fetchGCPKeys = async ({
    gcpRegion = getValues("gcpRegion")?.value,
    files = getValues("credentialFile"),
    shouldValidateMissingCredential = true,
    shouldSelectExistingKey = false
  }: {
    gcpRegion?: string;
    files?: FileList;
    shouldValidateMissingCredential?: boolean;
    shouldSelectExistingKey?: boolean;
  } = {}) => {
    keyLookupRequestId.current += 1;
    const requestId = keyLookupRequestId.current;
    resetField("keyObject");
    setKeys([]);
    setIsCredentialValid(false);

    if (!gcpRegion) return;

    const credentialJson = kms
      ? undefined
      : await getCredentialFileJson(files, requestId, shouldValidateMissingCredential);
    if (requestId !== keyLookupRequestId.current) return;
    if (!kms && !credentialJson) return;

    try {
      const response = await fetchGcpKeys({
        gcpRegion,
        ...(kms ? { kmsId: kms.id } : { credential: credentialJson! })
      });
      if (requestId !== keyLookupRequestId.current) return;

      setIsCredentialValid(true);

      const returnedKeys = response.keys.map((key) => {
        const parts = key.split("/");
        return {
          value: key,
          label: `${parts[5]}/${parts[7]}`
        };
      });

      setKeys(returnedKeys);
      if (kms && shouldSelectExistingKey) {
        const existingKey = returnedKeys.find(
          (key) => key.value === kms.externalKms.configuration.keyName
        );
        if (existingKey) {
          setValue("keyObject", existingKey, { shouldDirty: false, shouldValidate: true });
        }
      }
    } catch {
      if (requestId !== keyLookupRequestId.current) return;

      createNotification({
        text: "Failed to load GCP KMS keys",
        type: "error"
      });
    }
  };

  const handleGcpKmsFormSubmit = async (data: AddExternalKmsGcpFormSchemaType) => {
    const { name, description, formType, gcpRegion: gcpRegionObject, keyObject } = data;

    try {
      if (kms && formType === "updateGcpKms") {
        const gcpRegion = gcpRegionObject?.value;
        if (!gcpRegion) {
          setError("gcpRegion", {
            message: "Select a GCP region."
          });
          return;
        }

        if (keyObject && !keys.find((key) => key.value === keyObject.value)) {
          setError("keyObject", {
            message: "Select a valid key."
          });
          resetField("keyObject");
          return;
        }

        await updateGcpExternalKms({
          kmsId: kms.id,
          name,
          description,
          configuration: {
            type: ExternalKmsProvider.Gcp,
            inputs: {
              gcpRegion,
              keyName: keyObject?.value ?? kms.externalKms.configuration.keyName
            }
          }
        });

        createNotification({
          text: "GCP external KMS details updated",
          type: "success"
        });
      } else if (!kms && formType === "newGcpKms") {
        const gcpRegion = gcpRegionObject?.value;
        if (!gcpRegion) {
          setError("gcpRegion", {
            message: "Select a GCP region."
          });
          return;
        }

        if (!keys.find((key) => key.value === keyObject?.value)) {
          setError("keyObject", {
            message: "Select a valid key."
          });
          resetField("keyObject");
          return;
        }

        const credentialJson = await getCredentialFileJson();
        if (!credentialJson) return;

        await addGcpExternalKms({
          name,
          description,
          configuration: {
            type: ExternalKmsProvider.Gcp,
            inputs: {
              gcpRegion,
              keyName: keyObject?.value ?? "",
              credential: credentialJson
            }
          }
        });

        createNotification({
          text: "GCP external KMS created",
          type: "success"
        });
      }

      onCompleted();
    } catch {
      createNotification({
        text: kms ? "Failed to update GCP external KMS" : "Failed to create GCP external KMS",
        type: "error"
      });
    }
  };

  const getPlaceholderText = () => {
    if (isFetchGcpKeysLoading) return "Loading keys in this region...";
    if (!isCredentialValid)
      return kms ? "Select a region to load keys" : "Upload a valid credential file";
    if (keys.length) return "Select a key";
    return "No keys found in this region";
  };

  useEffect(() => {
    if (kms && mode !== "credentials") {
      fetchGCPKeys({
        gcpRegion: kms.externalKms.configuration.gcpRegion,
        shouldSelectExistingKey: true
      });
    }

    return () => {
      keyLookupRequestId.current += 1;
    };
    // Fetch once when the selected KMS changes. Form callbacks intentionally stay out of this dependency list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kms?.id, mode]);

  const formActions = (
    <>
      <Button type="button" variant="ghost" onClick={onCancel}>
        {mode === "credentials" ? "Close" : secondaryActionLabel}
      </Button>
      {mode !== "credentials" && (
        <Button
          type="submit"
          variant={isSubOrganization ? "sub-org" : "org"}
          isPending={isSubmitting}
          isDisabled={isSubmitting || Boolean(kms && !isDirty)}
        >
          {kms ? "Save Changes" : "Add KMS"}
        </Button>
      )}
    </>
  );

  return (
    <form
      onSubmit={handleSubmit(handleGcpKmsFormSubmit)}
      autoComplete="off"
      className={layout === "sheet" ? "flex min-h-0 flex-1 flex-col" : "flex flex-col gap-4"}
    >
      {mode === "credentials" ? (
        <p className="text-sm text-accent">
          GCP service account credentials cannot be changed after this KMS is created. Add a new
          external KMS and assign it to the projects that need to use it.
        </p>
      ) : (
        <FieldGroup className={layout === "sheet" ? "flex-1 overflow-y-auto px-4" : undefined}>
          <Controller
            control={control}
            name="name"
            render={({ field, fieldState: { error } }) => (
              <Field data-invalid={Boolean(error)}>
                <FieldLabel htmlFor="gcp-kms-alias">Alias</FieldLabel>
                <Input
                  {...field}
                  id="gcp-kms-alias"
                  value={field.value ?? ""}
                  isError={Boolean(error)}
                  placeholder="production-kms"
                />
                <FieldError>{error?.message}</FieldError>
              </Field>
            )}
          />
          <Controller
            control={control}
            name="description"
            render={({ field, fieldState: { error } }) => (
              <Field data-invalid={Boolean(error)}>
                <FieldLabel htmlFor="gcp-kms-description">Description</FieldLabel>
                <Input
                  {...field}
                  id="gcp-kms-description"
                  value={field.value ?? ""}
                  isError={Boolean(error)}
                  placeholder="KMS for production organization data"
                />
                <FieldError>{error?.message}</FieldError>
              </Field>
            )}
          />
          <Controller
            control={control}
            name="gcpRegion"
            render={({ field, fieldState: { error } }) => (
              <Field data-invalid={Boolean(error)}>
                <FieldLabel htmlFor="gcp-kms-region">GCP Region</FieldLabel>
                <FilterableSelect<SelectOption>
                  inputId="gcp-kms-region"
                  placeholder="Select a GCP region"
                  options={GCP_REGIONS}
                  value={field.value}
                  isError={Boolean(error)}
                  onChange={(option) => {
                    const region = option as SelectOption | null;
                    resetField("keyObject");
                    field.onChange(region);
                    fetchGCPKeys({
                      gcpRegion: region?.value,
                      shouldValidateMissingCredential: false
                    });
                  }}
                  formatOptionLabel={formatOptionLabel}
                />
                <FieldError>{error?.message}</FieldError>
              </Field>
            )}
          />
          {!kms && (
            <Controller
              control={control}
              name="credentialFile"
              render={({ field: { onChange }, fieldState: { error } }) => (
                <Field data-invalid={Boolean(error)}>
                  <FieldLabel>Service Account Credential JSON</FieldLabel>
                  <FileDropzone
                    accept=".json,application/json"
                    description=".json service account credential, up to 8 KB"
                    files={credentialFiles}
                    accentClassName={isSubOrganization ? "text-sub-org" : "text-org"}
                    activeFrameClassName={isSubOrganization ? "text-sub-org" : "text-org"}
                    activeEmptyClassName={isSubOrganization ? "bg-sub-org/10" : "bg-org/10"}
                    onFilesSelect={(selectedFiles) => {
                      const nextFiles = selectedFiles.slice(0, 1);
                      const fileList = filesToFileList(nextFiles);
                      setCredentialFiles(nextFiles);
                      onChange(fileList);
                      fetchGCPKeys({ files: fileList });
                    }}
                    onFileRemove={() => {
                      const fileList = filesToFileList([]);
                      setCredentialFiles([]);
                      onChange(fileList);
                      fetchGCPKeys({
                        files: fileList,
                        shouldValidateMissingCredential: false
                      });
                    }}
                  />
                  <FieldDescription>
                    Used only to discover and access KMS keys in the selected project.
                  </FieldDescription>
                  <FieldError>{error?.message}</FieldError>
                </Field>
              )}
            />
          )}
          <Controller
            control={control}
            name="keyObject"
            render={({ field, fieldState: { error } }) => (
              <Field data-invalid={Boolean(error)}>
                <FieldLabel htmlFor="gcp-kms-key">GCP Key</FieldLabel>
                <FilterableSelect<SelectOption>
                  inputId="gcp-kms-key"
                  placeholder={getPlaceholderText()}
                  isDisabled={!isCredentialValid || !keys.length}
                  isLoading={isFetchGcpKeysLoading}
                  options={keys}
                  value={field.value ?? null}
                  isError={Boolean(error)}
                  onChange={field.onChange}
                />
                <FieldError>{error?.message}</FieldError>
              </Field>
            )}
          />
        </FieldGroup>
      )}
      {layout === "sheet" ? (
        <SheetFooter className="justify-end border-t">{formActions}</SheetFooter>
      ) : (
        <DialogFooter>{formActions}</DialogFooter>
      )}
    </form>
  );
};
