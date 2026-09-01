import { BadRequestError } from "@app/lib/errors";

import { GCP_MAX_CERTIFICATES_PER_MAP_ENTRY } from "./gcp-certificate-manager-pki-sync-constants";
import { GcpCertificateManagerScope } from "./gcp-certificate-manager-pki-sync-enums";
import {
  TGcpCertificateManagerPkiSyncConfig,
  TGcpCertificateManagerPkiSyncConfigUpdate
} from "./gcp-certificate-manager-pki-sync-types";

export const resolveGcpCertificateManagerConfigUpdate = (
  previous: TGcpCertificateManagerPkiSyncConfig,
  next: TGcpCertificateManagerPkiSyncConfigUpdate
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

  const effectiveScope = next.scope ?? previous.scope;
  if (next.certificateMapBinding && effectiveScope && effectiveScope !== GcpCertificateManagerScope.Default) {
    throw new BadRequestError({
      message: `Certificate map binding requires the Default scope, but this sync uses "${effectiveScope}". A certificate map entry can only reference a Default-scope certificate.`
    });
  }

  return { ...next, ...(effectiveScope ? { scope: effectiveScope } : {}) };
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
