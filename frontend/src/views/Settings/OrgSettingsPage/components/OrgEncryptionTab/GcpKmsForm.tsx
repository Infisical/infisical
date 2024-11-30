import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { createNotification } from "@app/components/notifications";
import { Button, FilterableSelect, FormControl, Input } from "@app/components/v2";
import { useOrganization } from "@app/context";
import {
  useAddExternalKms,
  useExternalKmsValidateGcpCredential,
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
};

export const GcpKmsForm = ({ onCompleted, onCancel, kms }: Props) => {
  const [isCredentialValid, setIsCredentialValid] = useState<boolean>(false);
  const [keys, setKeys] = useState<{ value: string; label: string }[]>([]);

  const {
    control,
    handleSubmit,
    setError,
    clearErrors,
    getValues,
    resetField,
    formState: { isSubmitting }
  } = useForm<AddExternalKmsGcpFormSchemaType>({
    resolver: zodResolver(AddExternalKmsGcpFormSchema),
    defaultValues: {
      name: kms?.name ?? "",
      description: kms?.description ?? "",
      gcpRegion: kms?.external?.providerInput?.gcpRegion ?? "",
      keyObject: kms?.external?.providerInput?.keyName
        ? {
            label: "",
            value: kms?.external?.providerInput?.keyName ?? ""
          }
        : undefined
    }
  });

  const { currentOrg } = useOrganization();
  const { mutateAsync: addGcpExternalKms } = useAddExternalKms(currentOrg?.id!);
  const { mutateAsync: updateGcpExternalKms } = useUpdateExternalKms(currentOrg?.id!);
  const { mutateAsync: validateGcpCredential } = useExternalKmsValidateGcpCredential(
    currentOrg?.id!
  );

  // transforms the credential file into a JSON object
  async function getCredentialFileJson(): Promise<ExternalKmsGcpCredentialSchemaType | undefined> {
    const file = getValues("credentialFile")[0];
    if (!file) {
      return undefined;
    }
    if (file.type !== "application/json") {
      setError("credentialFile", {
        message: "Only .json files are accepted."
      });
      return undefined;
    }
    const jsonContents = await file.text();
    const parsedJson = ExternalKmsGcpCredentialSchema.safeParse(JSON.parse(jsonContents));
    if (!parsedJson.success) {
      console.log("🔥", { errors: JSON.stringify(parsedJson.error) });
      setError("credentialFile", {
        message: "Invalid Service Account credential JSON."
      });
      return undefined;
    }
    return parsedJson.data;
  }

  // handles the form submission
  const handleAddGcpKms = async (data: AddExternalKmsGcpFormSchemaType) => {
    const { name, description, gcpRegion, keyObject } = data;
    const credentialJson = await getCredentialFileJson();
    if (!credentialJson) {
      return;
    }
    console.log("🔥", { data });
    try {
      if (kms) {
        await updateGcpExternalKms({
          kmsId: kms.id,
          name,
          description,
          provider: {
            type: ExternalKmsProvider.GCP,
            inputs: {
              gcpRegion,
              keyName: keyObject?.value,
              credential: credentialJson
            }
          }
        });

        createNotification({
          text: "Successfully updated GCP External KMS",
          type: "success"
        });
      } else {
        await addGcpExternalKms({
          name,
          description,
          provider: {
            type: ExternalKmsProvider.GCP,
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

  const onCredentialFileChange = async () => {
    const credentialJson = await getCredentialFileJson();
    if (!credentialJson) {
      return;
    }
    if (!getValues("gcpRegion")) {
      setError("credentialFile", {
        message: "Please select a GCP region first."
      });
      return;
    }

    // If checks pass, we validate the credential on the backend and get GCP keys
    clearErrors("credentialFile");
    resetField("keyObject");
    const res = await validateGcpCredential({
      gcpRegion: getValues("gcpRegion"),
      credential: credentialJson,
      keyName: ""
    });
    setIsCredentialValid(!!res.keys);
    const returnedKeys = res.keys.map((key) => {
      const parts = key.split("/");
      const lastTwoParts = parts.slice(-3, -1).join("/");
      return {
        value: key,
        label: lastTwoParts
      };
    });
    setKeys(returnedKeys);
  };
  const onGcpRegionChange = () => {
    resetField("keyObject");
    const file = getValues("credentialFile");
    if (file) {
      onCredentialFileChange();
    }
  };

  const getPlaceholderText = () => {
    if (!isCredentialValid) {
      return "Upload a valid credential file";
    }
    if (keys.length) {
      return "Select a key";
    }
    return "No valid keys found";
  };

  return (
    <form onSubmit={handleSubmit(handleAddGcpKms)} autoComplete="off">
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
      <Controller
        control={control}
        name="gcpRegion"
        render={({ field, fieldState: { error } }) => (
          <FormControl label="GCP Region" errorText={error?.message} isError={Boolean(error)}>
            <Input
              placeholder=""
              {...field}
              onChange={(e) => {
                field.onChange(e);
                onGcpRegionChange();
              }}
            />
          </FormControl>
        )}
      />

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
                onCredentialFileChange();
              }}
            />
          </FormControl>
        )}
      />

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
      <div className="mt-6 flex items-center space-x-4">
        <Button type="submit" isLoading={isSubmitting}>
          Save
        </Button>
        <Button variant="outline_bg" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
};
