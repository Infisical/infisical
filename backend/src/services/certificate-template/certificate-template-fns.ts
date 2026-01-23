import RE2 from "re2";

import { TCertificateTemplates } from "@app/db/schemas/certificate-templates";
import { BadRequestError } from "@app/lib/errors";
import { ms } from "@app/lib/ms";

export const validateCertificateDetailsAgainstTemplate = (
  cert: {
    commonName: string;
    notBeforeDate: Date;
    notAfterDate: Date;
    altNames: string[];
  },
  template: TCertificateTemplates
) => {
  // these are validated in router using validateTemplateRegexField
  const commonNameRegex = new RE2(template.commonName);
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

  const subjectAlternativeNameRegex = new RE2(template.subjectAlternativeName);
  cert.altNames.forEach((altName) => {
    if (!subjectAlternativeNameRegex.test(altName)) {
      throw new BadRequestError({
        message: "Invalid subject alternative name based on template policy"
      });
    }
  });
};
