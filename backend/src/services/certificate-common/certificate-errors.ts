import { BadRequestError, NotFoundError } from "@app/lib/errors";

export const certificateNotFoundError = ({
  id,
  serialNumber,
  thumbprint
}: {
  id?: string;
  serialNumber?: string;
  thumbprint?: string;
}) => {
  const searchHint =
    "Search your organization's certificates with POST /api/v1/cert-manager/certificates/search to find the right one.";
  if (!id && !serialNumber && thumbprint) {
    return new NotFoundError({
      message: `Certificate with thumbprint '${thumbprint}' not found. Check that it is the certificate's SHA-1 or SHA-256 thumbprint, or find the certificate by common name or serial number: ${searchHint}`
    });
  }
  const identifier = !id && serialNumber ? `serial number '${serialNumber}'` : `ID '${id}'`;
  return new NotFoundError({ message: `Certificate with ${identifier} not found. ${searchHint}` });
};

export const invalidCsrAltNameError = (altName: string) =>
  new BadRequestError({
    message: `Alt name '${altName}' in the CSR is not a valid DNS name, IP address, email address or URI.`
  });
