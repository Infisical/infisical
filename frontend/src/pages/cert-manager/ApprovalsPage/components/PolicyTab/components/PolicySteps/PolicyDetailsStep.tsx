import { useMemo } from "react";
import { Controller, useFormContext } from "react-hook-form";

import { TtlFormLabel } from "@app/components/features";
import { Checkbox, FilterableSelect, FormControl, Input } from "@app/components/v2";
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
            <FormControl
              label="Policy Name"
              className="mb-0 flex-1"
              isRequired
              isError={Boolean(error)}
              errorText={error?.message}
            >
              <Input {...field} placeholder="Enter policy name" />
            </FormControl>
          )}
        />

        <Controller
          control={control}
          name="maxRequestTtl"
          render={({ field, fieldState: { error } }) => (
            <FormControl
              label={<TtlFormLabel label="Max. Request TTL" />}
              className="mb-0"
              isError={Boolean(error)}
              errorText={error?.message}
              helperText="Maximum time a request can be pending (optional)"
            >
              <Input
                {...field}
                value={field.value || ""}
                placeholder="e.g., 7d"
                onChange={(e) => {
                  if (!e.target.value || e.target.value === "") {
                    field.onChange(null);
                    return;
                  }
                  field.onChange(e.target.value);
                }}
              />
            </FormControl>
          )}
        />
      </div>

      <Controller
        control={control}
        name="conditions.0.profileNames"
        render={({ field: profileField, fieldState: { error } }) => (
          <FormControl
            isRequired
            label="Certificate Profiles"
            isError={Boolean(error)}
            errorText={error?.message}
            helperText="Policy applies to certificates issued from these profiles"
          >
            <FilterableSelect
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
          </FormControl>
        )}
      />

      <Controller
        control={control}
        name="bypassForMachineIdentities"
        render={({ field: { value, onChange } }) => (
          <div className="mt-2 items-center">
            <Checkbox
              id="bypassForMachineIdentities"
              isChecked={value}
              onCheckedChange={onChange}
              checkIndicatorBg="text-primary"
            >
              <span className="text-sm text-mineshaft-200">
                Bypass approval for machine identities
              </span>
              <p className="text-xs text-mineshaft-400">
                When enabled, machine identities can issue certificates without requiring approval
              </p>
            </Checkbox>
          </div>
        )}
      />
    </div>
  );
};
