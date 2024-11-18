import ms from "ms";

import { TCertificateTemplates } from "@app/db/schemas";
import { BadRequestError } from "@app/lib/errors";

export const validateCertificateDetailsAgainstTemplate = (
  cert: {
    commonName: string;
    notBeforeDate: Date;
    notAfterDate: Date;
    altNames: string[];
  },
  template: TCertificateTemplates
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

  const subjectAlternativeNameRegex = new RegExp(template.subjectAlternativeName);
  cert.altNames.forEach((altName) => {
    if (!subjectAlternativeNameRegex.test(altName)) {
      throw new BadRequestError({
        message: "Invalid subject alternative name based on template policy"
      });
    }
  });
};
