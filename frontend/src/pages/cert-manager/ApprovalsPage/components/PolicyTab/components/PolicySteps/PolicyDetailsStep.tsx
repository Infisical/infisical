import { useMemo, useState } from "react";
import { Controller, useFormContext } from "react-hook-form";
import axios from "axios";

import { TtlFormLabel } from "@app/components/features";
import {
  Checkbox,
  Combobox,
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@app/components/v3";
import { ApprovalPolicyType } from "@app/hooks/api/approvalPolicies";
import { useListCertificateProfiles } from "@app/hooks/api/certificateProfiles";
import {
  PkiApplicationResourceActions,
  PkiApplicationResourceSub,
  useAttachPkiApplicationProfiles,
  useGetPkiApplicationPermissions,
  useListPkiApplicationProfiles
} from "@app/hooks/api/pkiApplications";
import { useProfileCreation } from "@app/pages/cert-manager/PoliciesPage/components/CertificateProfilesTab/useProfileCreation";

import { TPolicyForm } from "../PolicySchema";

type ProfileOption = {
  label: string;
  value: string;
};

type Props = {
  applicationId?: string;
  isEditing?: boolean;
};

export const PolicyDetailsStep = ({ applicationId, isEditing }: Props) => {
  const { control, getValues, setValue, watch } = useFormContext<TPolicyForm>();
  const isRevocationPolicy = watch("policyType") === ApprovalPolicyType.CertRevocation;

  const { data: profilesData, isPending: isProfilesLoading } = useListCertificateProfiles({
    enabled: !applicationId
  });
  const {
    data: appProfiles = [],
    isPending: isAppProfilesLoading,
    refetch: refetchAppProfiles
  } = useListPkiApplicationProfiles(applicationId ?? "");
  const { data: appPermission } = useGetPkiApplicationPermissions(applicationId ?? "");
  const canManageAppProfiles = appPermission?.permission.can(
    PkiApplicationResourceActions.ManageProfiles,
    PkiApplicationResourceSub.Application
  );
  const attach = useAttachPkiApplicationProfiles();
  const [attachedProfileId, setAttachedProfileId] = useState<string>();
  const creationLabel = applicationId ? "Create and Attach Profile" : "Create New Profile";
  const profileCreation = useProfileCreation<ProfileOption>(
    async (profile) => {
      let { slug } = profile;
      if (applicationId) {
        if (!canManageAppProfiles) {
          throw new Error(
            "The profile was created, but you no longer have permission to attach it to this application."
          );
        }
        if (attachedProfileId !== profile.id) {
          try {
            await attach.mutateAsync({ applicationId, profileIds: [profile.id] });
          } catch (error) {
            let message =
              "The profile was created, but attachment failed. Retry to attach it to this application.";
            if (axios.isAxiosError<{ message?: unknown }>(error)) {
              if (!error.response) {
                message =
                  "The profile was created, but no response was received for the attachment request. Check your connection to Infisical, then retry.";
              } else if (typeof error.response.data?.message === "string") {
                const apiMessage = error.response.data.message.trim();
                if (apiMessage) {
                  message = `The profile was created, but attachment failed: ${apiMessage}`;
                }
              }
            }
            throw new Error(message);
          }
          setAttachedProfileId(profile.id);
        }
        const result = await refetchAppProfiles();
        const listedProfile = result.data?.find((option) => option.profileId === profile.id);
        if (result.isError || !listedProfile) {
          throw new Error(
            "The profile was attached, but the available profiles could not be refreshed. Retry to load and select it."
          );
        }
        slug = listedProfile.profileSlug;
      }
      setValue(
        "conditions.0.profileNames",
        [...new Set([...getValues("conditions.0.profileNames"), slug])],
        {
          shouldDirty: true,
          shouldValidate: true
        }
      );
    },
    { mode: applicationId ? "create-and-attach" : "create-only" }
  );

  const profileOptions: ProfileOption[] = useMemo(() => {
    if (applicationId) {
      return appProfiles.map((p) => ({ label: p.profileSlug, value: p.profileSlug }));
    }
    return (
      profilesData?.certificateProfiles?.map((profile) => ({
        label: profile.slug,
        value: profile.slug
      })) || []
    );
  }, [applicationId, appProfiles, profilesData?.certificateProfiles]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex w-full gap-4">
        <Controller
          control={control}
          name="name"
          render={({ field, fieldState: { error } }) => (
            <Field className="flex-1">
              <FieldLabel htmlFor="policy-name">
                Policy Name <span className="text-danger">*</span>
              </FieldLabel>
              <FieldContent>
                <Input
                  {...field}
                  id="policy-name"
                  placeholder="Enter policy name"
                  autoComplete="off"
                  name="policy-name"
                  isError={Boolean(error)}
                />
                <FieldError errors={[error]} />
              </FieldContent>
            </Field>
          )}
        />

        <Controller
          control={control}
          name="maxRequestTtl"
          render={({ field, fieldState: { error } }) => (
            <Field className="w-auto">
              <TtlFormLabel label="Max. Request TTL" />
              <FieldContent>
                <Input
                  {...field}
                  value={field.value || ""}
                  placeholder="e.g., 7d"
                  isError={Boolean(error)}
                  onChange={(e) => {
                    if (!e.target.value || e.target.value === "") {
                      field.onChange(null);
                      return;
                    }
                    field.onChange(e.target.value);
                  }}
                />
                <FieldDescription isOpen={!error}>
                  Maximum time a request can be pending (optional)
                </FieldDescription>
                <FieldError errors={[error]} />
              </FieldContent>
            </Field>
          )}
        />
      </div>

      {applicationId && (
        <Controller
          control={control}
          name="policyType"
          render={({ field: { onChange, ...field } }) => (
            <Field>
              <FieldLabel htmlFor="policy-type">Policy Type</FieldLabel>
              <FieldContent>
                <Select
                  value={field.value}
                  name={field.name}
                  onValueChange={onChange}
                  disabled={isEditing}
                >
                  <SelectTrigger id="policy-type" ref={field.ref} className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ApprovalPolicyType.CertRequest}>Issuance</SelectItem>
                    <SelectItem value={ApprovalPolicyType.CertRevocation}>Revocation</SelectItem>
                  </SelectContent>
                </Select>
                <FieldDescription>
                  {isEditing
                    ? "A policy's type can't be changed after it's created."
                    : "Issuance covers new certificates and renewals. Revocation covers revoking certificates."}
                </FieldDescription>
              </FieldContent>
            </Field>
          )}
        />
      )}

      <Controller
        control={control}
        name="conditions.0.profileNames"
        render={({ field: profileField, fieldState: { error } }) => (
          <Field>
            <FieldLabel htmlFor="policy-profile-names">
              Certificate Profiles <span className="text-danger">*</span>
            </FieldLabel>
            <FieldContent>
              <Combobox
                ref={profileField.ref}
                id="policy-profile-names"
                onBlur={profileField.onBlur}
                multiple
                isError={Boolean(error)}
                isLoading={applicationId ? isAppProfilesLoading : isProfilesLoading}
                options={profileOptions}
                getOptionValue={(option) => option.value}
                getOptionLabel={(option) => option.label}
                value={profileField.value.map((slug) => ({ label: slug, value: slug }))}
                onValueChange={(selected) => {
                  profileField.onChange(selected.map((opt) => opt.value));
                }}
                placeholder="Select certificate profiles..."
                emptyMessage="No profiles found"
                creation={
                  (!applicationId || canManageAppProfiles) && profileCreation
                    ? {
                        ...profileCreation,
                        emptyLabel: creationLabel,
                        formatLabel: () => creationLabel
                      }
                    : undefined
                }
              />
              <FieldDescription isOpen={!error}>
                {isRevocationPolicy
                  ? "Revoking a certificate issued from these selected profiles requires approval"
                  : "Policy applies to certificates issued from these selected profiles"}
              </FieldDescription>
              <FieldError errors={[error]} />
            </FieldContent>
          </Field>
        )}
      />

      {!isRevocationPolicy && (
        <Controller
          control={control}
          name="bypassForMachineIdentities"
          render={({ field: { value, onChange } }) => (
            <Field orientation="horizontal" className="mt-2">
              <Checkbox
                id="bypassForMachineIdentities"
                variant="project"
                isChecked={value}
                onCheckedChange={onChange}
              />
              <FieldContent>
                <FieldLabel htmlFor="bypassForMachineIdentities" className="cursor-pointer">
                  Bypass approval for machine identities
                </FieldLabel>
                <FieldDescription>
                  When enabled, machine identities can issue certificates without requiring approval
                </FieldDescription>
              </FieldContent>
            </Field>
          )}
        />
      )}
    </div>
  );
};
