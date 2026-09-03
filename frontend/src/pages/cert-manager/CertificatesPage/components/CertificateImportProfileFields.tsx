import { useEffect } from "react";
import { Control, Controller, UseFormSetValue, useWatch } from "react-hook-form";
import { OptionProps } from "react-select";

import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
  FilterableSelect,
  Input,
  ReactSelectOption,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { useDigiCertConnectionListOrders } from "@app/hooks/api/appConnections/digicert";
import { useListCasByProjectId } from "@app/hooks/api/ca";
import { CaStatus, CaType } from "@app/hooks/api/ca/enums";
import { useListCertificateProfiles } from "@app/hooks/api/certificateProfiles/queries";

import { getCertificateImportReference, isCaTypeLinkable } from "./certificate-import-linkage";
import { CertificateImportFormData } from "./types";

type ProfileOption = {
  id: string;
  slug: string;
  caId: string | null;
  caType: CaType | null;
  isLinkable: boolean;
};

type ReferenceOption = { value: string; label: string };

type Props = {
  control: Control<CertificateImportFormData>;
  setValue: UseFormSetValue<CertificateImportFormData>;
  applicationId: string;
};

const ProfileOptionRow = (props: OptionProps<ProfileOption>) => {
  const { data, children } = props;

  if (data.isLinkable) return <ReactSelectOption {...props}>{children}</ReactSelectOption>;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div>
          <ReactSelectOption {...props}>
            <span className="cursor-not-allowed opacity-40">{children}</span>
          </ReactSelectOption>
        </div>
      </TooltipTrigger>
      <TooltipContent side="right" className="max-w-72">
        Infisical can&apos;t manage the lifecycle of a certificate issued by this authority yet.
      </TooltipContent>
    </Tooltip>
  );
};

export const CertificateImportProfileFields = ({ control, setValue, applicationId }: Props) => {
  const { data: profileData, isPending: isProfilesLoading } = useListCertificateProfiles({
    applicationId,
    includeConfigs: true,
    limit: 100
  });

  const profileOptions: ProfileOption[] = (profileData?.certificateProfiles ?? [])
    .map((profile) => {
      const caType = profile.caId
        ? ((profile.certificateAuthority?.externalType as CaType) ?? CaType.INTERNAL)
        : null;
      return {
        id: profile.id,
        slug: profile.slug,
        caId: profile.caId,
        caType,
        isLinkable: profile.caId ? isCaTypeLinkable(caType) : true
      };
    })
    .sort((a, b) => Number(b.isLinkable) - Number(a.isLinkable));

  const selectedProfileId = useWatch({ control, name: "profileId" });
  const selectedProfile = profileOptions.find((option) => option.id === selectedProfileId) ?? null;
  const reference = getCertificateImportReference(selectedProfile?.caType);

  const { data: cas = [] } = useListCasByProjectId();
  const selectedCa = cas.find(
    (ca) => ca.id === selectedProfile?.caId && ca.status === CaStatus.ACTIVE
  );
  const digicertConfig =
    selectedCa?.type === CaType.DIGICERT && reference?.hasLiveOptions
      ? selectedCa.configuration
      : undefined;

  const {
    data: orders = [],
    isPending: isOptionsLoading,
    isError: isOptionsError
  } = useDigiCertConnectionListOrders(
    digicertConfig?.appConnectionId ?? "",
    digicertConfig?.organizationId ?? 0,
    digicertConfig?.productNameId ?? "",
    { enabled: Boolean(digicertConfig) }
  );

  const referenceOptions: ReferenceOption[] = orders.map((order) => ({
    value: String(order.orderId),
    label: `${order.commonName || "Certificate"} (#${order.orderId})`
  }));

  const useFreeTextReference =
    !reference?.hasLiveOptions ||
    !digicertConfig ||
    isOptionsError ||
    (!isOptionsLoading && !referenceOptions.length);

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
              <FilterableSelect<ProfileOption>
                isLoading={isProfilesLoading}
                isClearable
                options={profileOptions}
                components={{ Option: ProfileOptionRow }}
                isOptionDisabled={(option) => !option.isLinkable}
                value={profileOptions.find((option) => option.id === field.value) ?? null}
                onChange={(selected) =>
                  field.onChange((selected as ProfileOption | null)?.id ?? undefined)
                }
                getOptionLabel={(option) => option.slug}
                getOptionValue={(option) => option.id}
                placeholder="Select a profile..."
                noOptionsMessage={() => "This application has no certificate profiles."}
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
                {useFreeTextReference ? (
                  <Input
                    value={field.value ?? ""}
                    onChange={(e) => field.onChange(e.target.value)}
                    placeholder={reference.placeholder}
                  />
                ) : (
                  <FilterableSelect<ReferenceOption>
                    isLoading={isOptionsLoading}
                    isClearable
                    options={referenceOptions}
                    value={referenceOptions.find((option) => option.value === field.value) ?? null}
                    onChange={(selected) =>
                      field.onChange((selected as ReferenceOption | null)?.value ?? "")
                    }
                    getOptionLabel={(option) => option.label}
                    getOptionValue={(option) => option.value}
                    placeholder={reference.optionsPlaceholder}
                  />
                )}
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
