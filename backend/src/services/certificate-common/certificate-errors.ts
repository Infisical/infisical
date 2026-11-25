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
  let identifier = `ID '${id}'`;
  if (!id && serialNumber) identifier = `serial number '${serialNumber}'`;
  else if (!id && thumbprint) identifier = `thumbprint '${thumbprint}'`;
  return new NotFoundError({
    message: `Certificate with ${identifier} not found. List your organization's certificates to find the right one.`
  });
};

export const invalidCsrAltNameError = (altName: string) =>
  new BadRequestError({
    message: `Alt name '${altName}' in the CSR is not a valid DNS name, IP address, email address or URI.`
  });
