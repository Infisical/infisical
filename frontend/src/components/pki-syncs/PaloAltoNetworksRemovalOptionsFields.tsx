import { useId } from "react";

import { Combobox, Field, FieldDescription, FieldLabel } from "@app/components/v3";
import { getPaloAltoNetworksProfileLabel } from "@app/helpers/pkiSyncs";
import { usePaloAltoNetworksConnectionListCertificates } from "@app/hooks/api/appConnections/palo-alto-networks";
import { TPkiSyncRemovalOptions, useListPkiSyncCertificates } from "@app/hooks/api/pkiSyncs";
import { TPaloAltoNetworksSslTlsProfilePkiSync } from "@app/hooks/api/pkiSyncs/types";

type Props = {
  syncId: string;
  connectionId: string;
  destinationConfig: TPaloAltoNetworksSslTlsProfilePkiSync["destinationConfig"];
  value: TPkiSyncRemovalOptions;
  onChange: (value: TPkiSyncRemovalOptions) => void;
};

export const PaloAltoNetworksRemovalOptionsFields = ({
  syncId,
  connectionId,
  destinationConfig,
  value,
  onChange
}: Props) => {
  const id = useId();
  const { data: certificates = [], isPending } = usePaloAltoNetworksConnectionListCertificates(
    connectionId,
    destinationConfig.template
  );
  const { data: syncCertificates, isPending: isSyncCertificatesPending } =
    useListPkiSyncCertificates(syncId, { limit: 100 });
  const syncCertificateNames = new Set(
    syncCertificates?.certificates.map((certificate) => certificate.externalIdentifier)
  );
  const options = certificates.filter(
    (certificate) =>
      (certificate.vsys === null ||
        certificate.vsys === destinationConfig.sslTlsServiceProfileVsys) &&
      !(certificate.vsys === null && syncCertificateNames.has(certificate.name))
  );
  const replacementCertificateName = value.replacementCertificateName as string | undefined;
  const selected = options.find((certificate) => certificate.name === replacementCertificateName);

  return (
    <Field>
      <FieldLabel htmlFor={id}>Replacement Certificate</FieldLabel>
      <Combobox
        id={id}
        isLoading={isPending || isSyncCertificatesPending}
        options={options}
        value={selected ?? null}
        onValueChange={(option) =>
          onChange({
            ...value,
            replacementCertificateName: option?.name
          })
        }
        getOptionLabel={(option) => getPaloAltoNetworksProfileLabel(option)}
        getOptionValue={(option) => option.name}
        placeholder="Select a certificate on the device"
      />
      <FieldDescription>
        The SSL/TLS service profile can&apos;t be left without a certificate. Choose the one it
        should switch to.
      </FieldDescription>
    </Field>
  );
};
