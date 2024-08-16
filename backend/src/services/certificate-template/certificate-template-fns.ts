import ms from "ms";

import { BadRequestError } from "@app/lib/errors";

export const validateCertificateDetailsAgainstTemplate = (
  cert: {
    commonName: string;
    notBeforeDate: Date;
    notAfterDate: Date;
  },
  template: {
    commonName: string;
    ttl: string;
  }
) => {
  const commonNameRegex = new RegExp(template.commonName);
  if (!commonNameRegex.test(cert.commonName)) {
    throw new BadRequestError({
      message: "Invalid common name based on template policy"
    });
  }

  if (cert.notAfterDate.getTime() - cert.notBeforeDate.getTime() > ms(template.ttl)) {
    throw new BadRequestError({
      message: "Invalid validity date based on template policy"
    });
  }
};
