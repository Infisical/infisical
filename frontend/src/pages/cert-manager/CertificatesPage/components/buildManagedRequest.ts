import { TCertificateProfileDefaults } from "@app/hooks/api/certificateProfiles/types";
import { CertExtendedKeyUsage, CertKeyUsage } from "@app/hooks/api/certificates/enums";
import { TUnifiedCertificateIssuanceDTO } from "@app/hooks/api/certificates/types";
import { CertSubjectAttributeType } from "@app/pages/cert-manager/PoliciesPage/components/CertificatePoliciesTab/shared/certificate-constants";

import type { FormData } from "./CertificateIssuanceModal";
import { filterUsages, formatSubjectAltNames, SUBJECT_ATTR_MAP } from "./certificateUtils";
import type { TemplateConstraints } from "./useCertificatePolicy";

type ManagedFormData = Extract<FormData, { requestMethod: "managed" }>;

type ManagedIssuanceRequest = Omit<TUnifiedCertificateIssuanceDTO, "attributes"> & {
  attributes: NonNullable<TUnifiedCertificateIssuanceDTO["attributes"]> & {
    basicConstraints?: { isCA: boolean; pathLength?: number };
    customExtensions?: { oid: string; value: string }[];
  };
};

type BuildManagedRequestParams = {
  formData: ManagedFormData;
  applicationId?: string;
  isAdcsProfile: boolean;
  constraints: TemplateConstraints;
  defaults?: TCertificateProfileDefaults | null;
};

export const buildManagedRequest = ({
  formData,
  applicationId,
  isAdcsProfile,
  constraints,
  defaults
}: BuildManagedRequestParams): ManagedIssuanceRequest => {
  const {
    profileId,
    ttl,
    subjectAttributes,
    subjectAltNames,
    basicConstraints,
    signatureAlgorithm,
    keyAlgorithm,
    keyUsages,
    extendedKeyUsages,
    customExtensions,
    metadata
  } = formData;

  const managedMetadataEntries = metadata?.filter((m) => m.key);

  const request: ManagedIssuanceRequest = {
    profileId,
    ...(applicationId && { applicationId }),
    attributes: {
      keyAlgorithm: keyAlgorithm || "",
      ...(!isAdcsProfile && {
        ttl,
        signatureAlgorithm: signatureAlgorithm || "",
        keyUsages: filterUsages(keyUsages) as CertKeyUsage[],
        extendedKeyUsages: filterUsages(extendedKeyUsages) as CertExtendedKeyUsage[]
      })
    },
    ...(managedMetadataEntries?.length && { metadata: managedMetadataEntries })
  };

  if (constraints.shouldShowSubjectSection) {
    if (subjectAttributes && subjectAttributes.length > 0) {
      SUBJECT_ATTR_MAP.forEach(({ attrType, requestKey }) => {
        const attr = subjectAttributes.find((a) => a.type === attrType);
        const value = attr?.value?.trim();
        if (value) {
          request.attributes[requestKey] = value;
        } else if (defaults?.[requestKey]) {
          request.attributes[requestKey] = null;
        }
      });

      // Domain components are multi-valued: collect every DC row (order preserved).
      const domainComponents = subjectAttributes
        .filter((attr) => attr.type === CertSubjectAttributeType.DOMAIN_COMPONENT)
        .map((attr) => attr.value.trim())
        .filter((val) => val.length > 0);
      if (domainComponents.length > 0) {
        request.attributes.domainComponents = domainComponents;
      }
    } else if (defaults) {
      // No subject attributes provided; send null overrides for profile defaults
      SUBJECT_ATTR_MAP.forEach(({ requestKey }) => {
        if (defaults[requestKey]) request.attributes[requestKey] = null;
      });
    }
  }

  if (constraints.shouldShowSanSection) {
    if (subjectAltNames && subjectAltNames.length > 0) {
      const formattedSans = formatSubjectAltNames(subjectAltNames);
      if (formattedSans && formattedSans.length > 0) {
        request.attributes.altNames = formattedSans;
      }
    } else {
      request.attributes.altNames = [];
    }
  }

  if (!isAdcsProfile) {
    if (
      (constraints.templateAllowsCA && basicConstraints?.isCA) ||
      constraints.templateRequiresCA
    ) {
      request.attributes.basicConstraints = {
        isCA: true,
        pathLength: basicConstraints?.pathLength ?? undefined
      };
    } else if (constraints.templateAllowsCA) {
      request.attributes.basicConstraints = { isCA: false };
    }
  }

  const suppliedExtensions = (customExtensions ?? [])
    .filter((entry) => entry.oid?.trim() && entry.value?.trim())
    .map((entry) => ({ oid: entry.oid.trim(), value: entry.value.trim() }));
  if (suppliedExtensions.length) {
    request.attributes.customExtensions = suppliedExtensions;
  }

  return request;
};
