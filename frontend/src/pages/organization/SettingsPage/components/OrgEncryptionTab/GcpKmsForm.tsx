import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { createNotification } from "@app/components/notifications";
import { Button, FilterableSelect, FormControl, Input } from "@app/components/v2";
import { Badge } from "@app/components/v3";
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
};

const GCP_REGIONS = [
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

const formatOptionLabel = ({ value, label }: { value: string; label: string }) => (
  <div className="flex w-full flex-row items-center justify-between">
    <span>{label}</span>
    <Badge variant="neutral">{value}</Badge>
  </div>
);

export const GcpKmsForm = ({ onCompleted, onCancel, kms, mode = "full" }: Props) => {
  const [isCredentialValid, setIsCredentialValid] = useState<boolean>(false);
  const [keys, setKeys] = useState<{ value: string; label: string }[]>([]);

  const {
    control,
    handleSubmit,
    setError,
    clearErrors,
    getValues,
    resetField,
    setValue,
    formState: { isSubmitting }
  } = useForm<AddExternalKmsGcpFormSchemaType>({
    resolver: zodResolver(AddExternalKmsGcpFormSchema),
    defaultValues: {
      formType: kms ? "updateGcpKms" : "newGcpKms",
      name: kms?.name ?? "",
      description: kms?.description ?? "",
      gcpRegion: kms
        ? {
            label:
              GCP_REGIONS.find((r) => r.value === kms.externalKms.configuration.gcpRegion)?.label ??
              "",
            value: kms.externalKms.configuration.gcpRegion
          }
        : undefined,
      keyObject: undefined
    }
  });

  const { currentOrg } = useOrganization();
  const { mutateAsync: addGcpExternalKms } = useAddExternalKms(currentOrg.id);
  const { mutateAsync: updateGcpExternalKms } = useUpdateExternalKms(
    currentOrg.id,
    ExternalKmsProvider.Gcp
  );
  const { mutateAsync: fetchGcpKeys, isPending: isFetchGcpKeysLoading } =
    useExternalKmsFetchGcpKeys(currentOrg?.id);

  // transforms the credential file into a JSON object
  async function getCredentialFileJson(): Promise<ExternalKmsGcpCredentialSchemaType | null> {
    const files = getValues("credentialFile");
    if (!files || !files.length) {
      return null;
    }
    const file = files[0];
    if (file.type !== "application/json") {
      setError("credentialFile", {
        message: "Only .json files are accepted."
      });
      return null;
    }
    const jsonContents = await file.text();
    const parsedJson = ExternalKmsGcpCredentialSchema.safeParse(JSON.parse(jsonContents));
    if (!parsedJson.success) {
      setError("credentialFile", {
        message: "Invalid Service Account credential JSON."
      });
      return null;
    }
    clearErrors("credentialFile");
    return parsedJson.data;
  }

  // handles the form submission
  const handleGcpKmsFormSubmit = async (data: AddExternalKmsGcpFormSchemaType) => {
    const { name, description, gcpRegion: gcpRegionObject, keyObject } = data;

    try {
      if (kms) {
        if (mode === "details") {
          await updateGcpExternalKms({
            kmsId: kms.id,
            name,
            description
          });

          createNotification({
            text: "Successfully updated GCP External KMS Details",
            type: "success"
          });
        } else if (mode === "credentials") {
          const gcpRegion = gcpRegionObject?.value;
          if (!gcpRegion) {
            setError("gcpRegion", {
              message: "Please select a GCP region."
            });
            return;
          }

          if (keyObject && !keys.find((k) => k.value === keyObject.value)) {
            setError("keyObject", {
              message: "Please select a valid key."
            });
            resetField("keyObject");
            return;
          }

          await updateGcpExternalKms({
            kmsId: kms.id,
            configuration: {
              type: ExternalKmsProvider.Gcp,
              inputs: {
                gcpRegion,
                keyName: keyObject?.value ?? kms.externalKms.configuration.keyName
              }
            }
          });

          createNotification({
            text: "Successfully updated GCP External KMS configuration",
            type: "success"
          });
        }
      } else {
        const gcpRegion = gcpRegionObject?.value;
        if (!gcpRegion) {
          setError("gcpRegion", {
            message: "Please select a GCP region."
          });
          return;
        }

        if (!keys.find((k) => k.value === keyObject?.value)) {
          setError("keyObject", {
            message: "Please select a valid key."
          });
          resetField("keyObject");
          return;
        }

        const credentialJson = await getCredentialFileJson();
        if (!credentialJson) {
          return;
        }
        await addGcpExternalKms({
          name,
          description,
          configuration: {
            type: ExternalKmsProvider.Gcp,
            inputs: {
              gcpRegion,
              keyName: keyObject?.value,
              credential: credentialJson
            }
          }
        });

        createNotification({
          text: "Successfully added GCP External KMS",
          type: "success"
        });
      }

      onCompleted();
    } catch (err) {
      console.error(err);
    }
  };

  const fetchGCPKeys = async () => {
    // @ts-expect-error - issue with the way react-select renders the placeholder. We need to set the value to null explicitly otherwise it will not re-render
    setValue("keyObject", null);
    setKeys([]);

    const credentialJson = kms ? undefined : await getCredentialFileJson();
    if (!kms && !credentialJson) {
      return;
    }
    const gcpRegionObject = getValues("gcpRegion");
    const gcpRegion = gcpRegionObject?.value;
    if (!gcpRegion) {
      setError("gcpRegion", {
        message: "Please select a GCP region to fetch GCP Keys."
      });
      return;
    }
    const res = await fetchGcpKeys({
      gcpRegion,
      ...(kms ? { kmsId: kms.id } : { credential: credentialJson! })
    });
    setIsCredentialValid(!!res.keys);
    const returnedKeys = res.keys.map((key) => {
      const parts = key.split("/");
      const keyLabel = `${parts[5]}/${parts[7]}`;
      return {
        value: key,
        label: keyLabel
      };
    });

    setKeys(returnedKeys);
    if (kms) {
      const existingKey = returnedKeys.find(
        (k) => k.value === kms.externalKms.configuration.keyName
      );
      if (existingKey) {
        setValue("keyObject", existingKey);
      }
    }
  };

  const getPlaceholderText = () => {
    if (isFetchGcpKeysLoading) {
      return "Loading keys in this region...";
    }
    if (!isCredentialValid) {
      return "Upload a valid credential file";
    }
    if (keys.length) {
      return "Select a key";
    }

    return "No valid keys found in this region";
  };

  useEffect(() => {
    if (kms && !isCredentialValid) {
      fetchGCPKeys();
    }
  }, [kms]);

  return (
    <form onSubmit={handleSubmit(handleGcpKmsFormSubmit)} autoComplete="off">
      {(mode === "full" || mode === "details") && (
        <>
          <Controller
            control={control}
            name="name"
            render={({ field, fieldState: { error } }) => (
              <FormControl label="Alias" errorText={error?.message} isError={Boolean(error)}>
                <Input placeholder="" {...field} />
              </FormControl>
            )}
          />
          <Controller
            control={control}
            name="description"
            render={({ field, fieldState: { error } }) => (
              <FormControl label="Description" errorText={error?.message} isError={Boolean(error)}>
                <Input placeholder="" {...field} />
              </FormControl>
            )}
          />
        </>
      )}
      {(mode === "full" || mode === "credentials") && (
        <>
          <Controller
            control={control}
            name="gcpRegion"
            render={({ field, fieldState: { error } }) => (
              <FormControl label="GCP Region" errorText={error?.message} isError={Boolean(error)}>
                <FilterableSelect
                  className="w-full"
                  placeholder="Select a GCP region"
                  name="gcpRegion"
                  options={GCP_REGIONS}
                  value={field.value}
                  onChange={(e) => {
                    resetField("keyObject");
                    field.onChange(e);
                    fetchGCPKeys();
                  }}
                  formatOptionLabel={formatOptionLabel}
                />
              </FormControl>
            )}
          />
          {!kms && (
            <Controller
              control={control}
              name="credentialFile"
              render={({ field: { value, onChange, ref, ...rest }, fieldState: { error } }) => (
                <FormControl
                  label="Service Account Credential JSON"
                  errorText={error?.message}
                  isError={Boolean(error)}
                >
                  <Input
                    {...rest}
                    ref={ref}
                    type="file"
                    accept=".json"
                    placeholder=""
                    value={value?.filename}
                    onChange={(e) => {
                      onChange(e.target.files);
                      fetchGCPKeys();
                    }}
                  />
                </FormControl>
              )}
            />
          )}
          <Controller
            control={control}
            name="keyObject"
            render={({ field, fieldState: { error } }) => (
              <FormControl label="GCP Key Name" errorText={error?.message} isError={Boolean(error)}>
                <FilterableSelect
                  className="w-full"
                  placeholder={getPlaceholderText()}
                  isDisabled={!isCredentialValid || !keys.length}
                  name="key"
                  options={keys}
                  value={field.value}
                  onChange={field.onChange}
                />
              </FormControl>
            )}
          />
          {kms && (
            <span className="text-xs text-mineshaft-300">
              To change your GCP credentials, create a new external KMS and assign it to project you
              want to use it with.
            </span>
          )}
        </>
      )}
      <div className="mt-6 flex items-center space-x-4">
        <Button type="submit" isLoading={isSubmitting}>
          {mode === "credentials" ? "Update Configuration" : "Save"}
        </Button>
        <Button variant="outline_bg" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
};
