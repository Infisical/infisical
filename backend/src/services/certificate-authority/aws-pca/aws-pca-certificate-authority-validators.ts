import { CertificateAuthorityUsageMode } from "@aws-sdk/client-acm-pca";

import { BadRequestError } from "@app/lib/errors";

import {
  API_CSR_PASSTHROUGH_TEMPLATE_ARN,
  AWS_PCA_MAX_CA_PATH_LENGTH,
  SUBORDINATE_CA_API_CSR_PASSTHROUGH_TEMPLATE_ARN_BY_PATH_LENGTH
} from "./aws-pca-certificate-authority-enums";

// Called by the order API before enqueuing, so a bad path length is a 400 rather than a failed job.
export const validateAwsPcaCaIssuanceInputs = ({
  basicConstraints
}: {
  basicConstraints?: { isCA: boolean; pathLength?: number | null } | null;
}) => {
  if (!basicConstraints?.isCA) return;

  const { pathLength } = basicConstraints;

  if (pathLength === undefined || pathLength === null) {
    throw new BadRequestError({
      message: `A path length between 0 and ${AWS_PCA_MAX_CA_PATH_LENGTH} is required when issuing a CA certificate from AWS Private CA, which has no template for an unlimited path length. If you are supplying a CSR, set it there, for example "basicConstraints=critical,CA:TRUE,pathlen:0".`
    });
  }

  if (!Number.isInteger(pathLength) || pathLength < 0 || pathLength > AWS_PCA_MAX_CA_PATH_LENGTH) {
    throw new BadRequestError({
      message: `Path length must be a whole number between 0 and ${AWS_PCA_MAX_CA_PATH_LENGTH} when issuing a CA certificate from AWS Private CA. Received: ${pathLength}.`
    });
  }
};

export const resolveAwsPcaTemplateArn = ({
  basicConstraints,
  usageMode
}: {
  basicConstraints?: { isCA: boolean; pathLength?: number | null } | null;
  usageMode?: CertificateAuthorityUsageMode;
}) => {
  if (!basicConstraints?.isCA) return API_CSR_PASSTHROUGH_TEMPLATE_ARN;

  if (usageMode === CertificateAuthorityUsageMode.SHORT_LIVED_CERTIFICATE) {
    throw new BadRequestError({
      message:
        "This AWS Private CA is in short-lived certificate mode, which cannot issue CA certificates. Use a general-purpose AWS Private CA instead."
    });
  }

  validateAwsPcaCaIssuanceInputs({ basicConstraints });

  return SUBORDINATE_CA_API_CSR_PASSTHROUGH_TEMPLATE_ARN_BY_PATH_LENGTH[basicConstraints.pathLength as number];
};
