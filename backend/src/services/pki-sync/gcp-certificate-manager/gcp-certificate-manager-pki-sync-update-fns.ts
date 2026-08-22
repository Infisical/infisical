import { BadRequestError } from "@app/lib/errors";

import { GCP_MAX_CERTIFICATES_PER_MAP_ENTRY } from "./gcp-certificate-manager-pki-sync-constants";
import { TGcpCertificateManagerPkiSyncConfig } from "./gcp-certificate-manager-pki-sync-types";

export const assertGcpCertificateManagerConfigUpdate = (
  previous: TGcpCertificateManagerPkiSyncConfig,
  next: TGcpCertificateManagerPkiSyncConfig
) => {
  if (previous.gcpProjectId && next.gcpProjectId && next.gcpProjectId !== previous.gcpProjectId) {
    throw new BadRequestError({
      message: `The GCP project cannot be changed after a GCP Certificate Manager sync is created. Create a new sync targeting "${next.gcpProjectId}" instead.`
    });
  }

  if (previous.location && next.location && next.location !== previous.location) {
    throw new BadRequestError({
      message: `The location cannot be changed after a GCP Certificate Manager sync is created, because a GCP certificate's location is immutable. Create a new sync targeting "${next.location}" instead.`
    });
  }

  if (previous.scope && next.scope && next.scope !== previous.scope) {
    throw new BadRequestError({
      message: `The scope cannot be changed after a GCP Certificate Manager sync is created, because a GCP certificate's scope is immutable. Create a new sync with the "${next.scope}" scope instead.`
    });
  }
};

export const buildGcpTooManyCertificatesMessage = (certificateMap: string, certificateCount: number) =>
  `This sync attaches its certificates to the GCP certificate map "${certificateMap}", and GCP allows at most ${GCP_MAX_CERTIFICATES_PER_MAP_ENTRY} certificates in one certificate map entry. Turn off the certificate map binding to sync ${certificateCount} certificates, or link at most ${GCP_MAX_CERTIFICATES_PER_MAP_ENTRY}.`;

export const assertGcpCertificateManagerCertificateCount = (
  destinationConfig: TGcpCertificateManagerPkiSyncConfig | undefined,
  resultingCertificateCount: number
) => {
  if (resultingCertificateCount <= GCP_MAX_CERTIFICATES_PER_MAP_ENTRY) return;

  const certificateMapBinding = destinationConfig?.certificateMapBinding;
  if (!certificateMapBinding) return;

  throw new BadRequestError({
    message: buildGcpTooManyCertificatesMessage(certificateMapBinding.certificateMap, resultingCertificateCount)
  });
};
