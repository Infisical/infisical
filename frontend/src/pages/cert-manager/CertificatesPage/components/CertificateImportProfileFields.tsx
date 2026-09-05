import { useEffect } from "react";
import { Control, Controller, UseFormSetValue, useWatch } from "react-hook-form";

import { Field, FieldContent, FieldDescription, FieldError, FieldLabel } from "@app/components/v3";

import {
  CertificateProfileSelect,
  CertificateReferenceField,
  useCertificateImportProfiles,
  useCertificateImportReference
} from "./certificate-import-fields";
import { CertificateImportFormData } from "./types";

type Props = {
  control: Control<CertificateImportFormData>;
  setValue: UseFormSetValue<CertificateImportFormData>;
  applicationId: string;
};

export const CertificateImportProfileFields = ({ control, setValue, applicationId }: Props) => {
  const { profileOptions, isProfilesLoading } = useCertificateImportProfiles(applicationId);

  const selectedProfileId = useWatch({ control, name: "profileId" });
  const selectedProfile = profileOptions.find((option) => option.id === selectedProfileId) ?? null;
  const referenceSource = useCertificateImportReference(selectedProfile);
  const { reference } = referenceSource;

  useEffect(() => {
    setValue("linkedCaType", selectedProfile?.caType ?? undefined);
    setValue("providerReference", "");
  }, [selectedProfileId, selectedProfile?.caType, setValue]);

  return (
    <>
      <Controller
        control={control}
        name="profileId"
        render={({ field, fieldState: { error } }) => (
          <Field data-invalid={Boolean(error)}>
            <FieldLabel>Certificate Profile (optional)</FieldLabel>
            <FieldContent>
              <CertificateProfileSelect
                options={profileOptions}
                isLoading={isProfilesLoading}
                value={field.value}
                onChange={field.onChange}
              />
              {error && <FieldError>{error.message}</FieldError>}
            </FieldContent>
          </Field>
        )}
      />

      {reference && (
        <Controller
          control={control}
          name="providerReference"
          render={({ field, fieldState: { error } }) => (
            <Field data-invalid={Boolean(error)}>
              <FieldLabel>{reference.label}</FieldLabel>
              <FieldContent>
                <CertificateReferenceField
                  source={referenceSource}
                  value={field.value}
                  onChange={field.onChange}
                />
                <FieldDescription>{reference.description}</FieldDescription>
                {error && <FieldError>{error.message}</FieldError>}
              </FieldContent>
            </Field>
          )}
        />
      )}
    </>
  );
};
