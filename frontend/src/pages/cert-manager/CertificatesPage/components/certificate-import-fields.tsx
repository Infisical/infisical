import { OptionProps } from "react-select";

import {
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

export type ProfileOption = {
  id: string;
  slug: string;
  caId: string | null;
  caType: CaType | null;
  isLinkable: boolean;
};

type ReferenceOption = { value: string; label: string };

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

export const useCertificateImportProfiles = (applicationId?: string) => {
  const { data, isPending } = useListCertificateProfiles({
    applicationId,
    limit: 100,
    enabled: Boolean(applicationId)
  });

  const profileOptions: ProfileOption[] = (data?.certificateProfiles ?? [])
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

  return { profileOptions, isProfilesLoading: isPending };
};

export const CertificateProfileSelect = ({
  options,
  isLoading,
  value,
  onChange
}: {
  options: ProfileOption[];
  isLoading: boolean;
  value?: string;
  onChange: (profileId?: string) => void;
}) => (
  <FilterableSelect<ProfileOption>
    isLoading={isLoading}
    isClearable
    options={options}
    components={{ Option: ProfileOptionRow }}
    isOptionDisabled={(option) => !option.isLinkable}
    value={options.find((option) => option.id === value) ?? null}
    onChange={(selected) => onChange((selected as ProfileOption | null)?.id ?? undefined)}
    getOptionLabel={(option) => option.slug}
    getOptionValue={(option) => option.id}
    placeholder="Select a profile..."
    noOptionsMessage={() => "This application has no certificate profiles."}
  />
);

export const useCertificateImportReference = (profile: ProfileOption | null) => {
  const reference = getCertificateImportReference(profile?.caType);

  const { data: cas = [] } = useListCasByProjectId();
  const selectedCa = cas.find((ca) => ca.id === profile?.caId && ca.status === CaStatus.ACTIVE);
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

  const useFreeText =
    !reference?.hasLiveOptions ||
    !digicertConfig ||
    isOptionsError ||
    (!isOptionsLoading && !referenceOptions.length);

  return { reference, referenceOptions, isOptionsLoading, useFreeText };
};

export type TCertificateReferenceSource = ReturnType<typeof useCertificateImportReference>;

export const CertificateReferenceField = ({
  source,
  value,
  onChange
}: {
  source: TCertificateReferenceSource;
  value?: string;
  onChange: (value: string) => void;
}) => {
  const { reference, referenceOptions, isOptionsLoading, useFreeText } = source;
  if (!reference) return null;

  if (useFreeText) {
    return (
      <Input
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={reference.placeholder}
      />
    );
  }

  return (
    <FilterableSelect<ReferenceOption>
      isLoading={isOptionsLoading}
      isClearable
      options={referenceOptions}
      value={referenceOptions.find((option) => option.value === value) ?? null}
      onChange={(selected) => onChange((selected as ReferenceOption | null)?.value ?? "")}
      getOptionLabel={(option) => option.label}
      getOptionValue={(option) => option.value}
      placeholder={reference.optionsPlaceholder}
    />
  );
};
