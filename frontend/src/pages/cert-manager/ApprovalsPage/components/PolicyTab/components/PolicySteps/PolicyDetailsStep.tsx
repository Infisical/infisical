import { useMemo } from "react";
import { Controller, useFormContext } from "react-hook-form";

import { TtlFormLabel } from "@app/components/features";
import { FilterableSelect } from "@app/components/v2";
import {
  Checkbox,
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
  Input
} from "@app/components/v3";
import { useListCertificateProfiles } from "@app/hooks/api/certificateProfiles";
import { useListPkiApplicationProfiles } from "@app/hooks/api/pkiApplications";

import { TPolicyForm } from "../PolicySchema";

type ProfileOption = {
  label: string;
  value: string;
};

type Props = {
  applicationId?: string;
};

export const PolicyDetailsStep = ({ applicationId }: Props) => {
  const { control } = useFormContext<TPolicyForm>();

  const { data: profilesData, isPending: isProfilesLoading } = useListCertificateProfiles({});
  const { data: appProfiles = [], isPending: isAppProfilesLoading } = useListPkiApplicationProfiles(
    applicationId ?? ""
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

      <Controller
        control={control}
        name="conditions.0.profileNames"
        render={({ field: profileField, fieldState: { error } }) => (
          <Field>
            <FieldLabel htmlFor="policy-profile-names">
              Certificate Profiles <span className="text-danger">*</span>
            </FieldLabel>
            <FieldContent>
              <FilterableSelect
                inputId="policy-profile-names"
                isMulti
                isLoading={applicationId ? isAppProfilesLoading : isProfilesLoading}
                options={profileOptions}
                value={profileField.value.map((slug) => ({ label: slug, value: slug }))}
                onChange={(selected) => {
                  const selectedOptions = selected as ProfileOption[];
                  profileField.onChange(selectedOptions.map((opt) => opt.value));
                }}
                placeholder="Select certificate profiles..."
                noOptionsMessage={() => "No profiles found"}
                maxMenuHeight={150}
              />
              <FieldDescription isOpen={!error}>
                Policy applies to certificates issued from these selected profiles
              </FieldDescription>
              <FieldError errors={[error]} />
            </FieldContent>
          </Field>
        )}
      />

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
    </div>
  );
};
