import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import axios from "axios";

import { Combobox, Input } from "@app/components/v3";
import { useDigiCertConnectionListOrders } from "@app/hooks/api/appConnections/digicert";
import { useListCasByProjectId } from "@app/hooks/api/ca";
import { CaStatus, CaType } from "@app/hooks/api/ca/enums";
import { caKeys } from "@app/hooks/api/ca/queries";
import { TUnifiedCertificateAuthority } from "@app/hooks/api/ca/types";
import { TCertificateProfile } from "@app/hooks/api/certificateProfiles";
import { useListCertificateProfiles } from "@app/hooks/api/certificateProfiles/queries";
import {
  PkiApplicationResourceActions,
  PkiApplicationResourceSub,
  useAttachPkiApplicationProfiles,
  useGetPkiApplicationPermissions
} from "@app/hooks/api/pkiApplications";
import { useProfileCreation } from "@app/pages/cert-manager/PoliciesPage/components/CertificateProfilesTab/useProfileCreation";

import { getCertificateImportReference, isCaTypeLinkable } from "./certificate-import-linkage";

export type ProfileOption = {
  id: string;
  slug: string;
  caId: string | null;
  caType: CaType | null;
  isLinkable: boolean;
};

type ReferenceOption = { value: string; label: string };

const toProfileOption = (profile: TCertificateProfile): ProfileOption => {
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
};

export const useCertificateImportProfiles = (applicationId?: string) => {
  const { data, isPending } = useListCertificateProfiles({
    applicationId,
    limit: 100,
    enabled: Boolean(applicationId)
  });

  const profileOptions: ProfileOption[] = (data?.certificateProfiles ?? [])
    .map(toProfileOption)
    .sort((a, b) => Number(b.isLinkable) - Number(a.isLinkable));

  return { profileOptions, isProfilesLoading: isPending };
};

export const CertificateProfileSelect = ({
  applicationId,
  options,
  isLoading,
  value,
  onChange
}: {
  applicationId?: string;
  options: ProfileOption[];
  isLoading: boolean;
  value?: string;
  onChange: (profileId?: string) => void;
}) => {
  const queryClient = useQueryClient();
  const { data: permissionData } = useGetPkiApplicationPermissions(applicationId ?? "");
  const attach = useAttachPkiApplicationProfiles();
  const [attachedProfileId, setAttachedProfileId] = useState<string>();
  const { refetch } = useListCertificateProfiles({
    applicationId,
    limit: 100,
    enabled: Boolean(applicationId)
  });
  const canAttach = permissionData?.permission.can(
    PkiApplicationResourceActions.ManageProfiles,
    PkiApplicationResourceSub.Application
  );
  const profileCreation = useProfileCreation<ProfileOption>(async (profile) => {
    if (!applicationId || !canAttach) {
      throw new Error(
        "The profile was created, but you no longer have permission to attach it to this application."
      );
    }
    const ca = queryClient
      .getQueryData<TUnifiedCertificateAuthority[]>(caKeys.listCasByProjectId())
      ?.find((option) => option.id === profile.caId);
    if (profile.caId && (!ca || !isCaTypeLinkable(ca.type))) {
      throw new Error(
        "The profile was created, but its certificate authority cannot manage imported certificates. Cancel setup and choose a supported profile."
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
    const result = await refetch();
    const listedProfile = result.data?.certificateProfiles.find(
      (option) => option.id === profile.id
    );
    if (result.isError || !listedProfile || !toProfileOption(listedProfile).isLinkable) {
      throw new Error(
        "The profile was attached, but the available profiles could not be refreshed. Retry to load and select it."
      );
    }
    onChange(listedProfile.id);
  });

  return (
    <Combobox<ProfileOption>
      aria-label="Certificate profile"
      isLoading={isLoading}
      isClearable
      options={options}
      renderOption={(option) => (
        <div className="min-w-0">
          <p>{option.slug}</p>
          {!option.isLinkable && (
            <p className="text-xs whitespace-normal text-muted">
              Infisical can&apos;t manage the lifecycle of a certificate issued by this authority
              yet.
            </p>
          )}
        </div>
      )}
      isOptionDisabled={(option) => !option.isLinkable}
      value={options.find((option) => option.id === value) ?? null}
      onValueChange={(selected) => onChange(selected?.id ?? undefined)}
      getOptionLabel={(option) => option.slug}
      getOptionValue={(option) => option.id}
      placeholder="Select a profile..."
      emptyMessage="This application has no certificate profiles."
      creation={
        canAttach && profileCreation
          ? {
              ...profileCreation,
              emptyLabel: "Create and Attach Profile",
              formatLabel: () => "Create and Attach Profile"
            }
          : undefined
      }
    />
  );
};

export const useCertificateImportReference = (profile: ProfileOption | null) => {
  const reference = getCertificateImportReference(profile?.caType);

  const { data: cas = [], isPending: isCasLoading } = useListCasByProjectId();
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
    label: `#${order.orderId} (${order.commonName || "Certificate"})`
  }));

  const isResolvingOptions =
    Boolean(reference?.hasLiveOptions) &&
    (isCasLoading || (Boolean(digicertConfig) && isOptionsLoading));

  const useFreeText =
    !reference?.hasLiveOptions ||
    (!isResolvingOptions && (!digicertConfig || isOptionsError || !referenceOptions.length));

  return { reference, referenceOptions, isOptionsLoading: isResolvingOptions, useFreeText };
};

type TCertificateReferenceSource = ReturnType<typeof useCertificateImportReference>;

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
    <Combobox<ReferenceOption>
      aria-label={reference.optionsPlaceholder}
      isLoading={isOptionsLoading}
      isClearable
      options={referenceOptions}
      value={referenceOptions.find((option) => option.value === value) ?? null}
      onValueChange={(selected) => onChange(selected?.value ?? "")}
      getOptionLabel={(option) => option.label}
      getOptionValue={(option) => option.value}
      placeholder={reference.optionsPlaceholder}
    />
  );
};
