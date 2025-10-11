interface CertificateRequestInput {
  keyUsages?: string[];
  extendedKeyUsages?: string[];
}

export const mapEnumsForValidation = <T extends CertificateRequestInput>(request: T): T => {
  const keyUsageMapping: Record<string, string> = {
    digitalSignature: "digital_signature",
    keyEncipherment: "key_encipherment",
    nonRepudiation: "non_repudiation",
    dataEncipherment: "data_encipherment",
    keyAgreement: "key_agreement",
    keyCertSign: "key_cert_sign",
    cRLSign: "crl_sign",
    encipherOnly: "encipher_only",
    decipherOnly: "decipher_only"
  };

  const extendedKeyUsageMapping: Record<string, string> = {
    serverAuth: "server_auth",
    clientAuth: "client_auth",
    codeSigning: "code_signing",
    emailProtection: "email_protection",
    timeStamping: "time_stamping",
    ocspSigning: "ocsp_signing"
  };

  return {
    ...request,
    keyUsages: request.keyUsages?.map((usage: string) => keyUsageMapping[usage] || usage),
    extendedKeyUsages: request.extendedKeyUsages?.map((usage: string) => extendedKeyUsageMapping[usage] || usage)
  } as T;
};

export const normalizeDateForApi = (date: Date | string | undefined): string | undefined => {
  if (!date) return undefined;
  return date instanceof Date ? date.toISOString() : date;
};

export const bufferToString = (data: Buffer | string): string => {
  return String(data);
};

export const buildCertificateSubjectFromTemplate = (
  request: Record<string, unknown>,
  templateAttributes?: Array<{
    type: string;
    include: "mandatory" | "optional" | "prohibit";
    value?: string[];
  }>
): Record<string, string | undefined> => {
  const subject: Record<string, string> = {};
  const attributeMap: Record<string, string> = {
    common_name: "commonName",
    organization_name: "organization",
    organization_unit: "organizationUnit",
    locality: "locality",
    state: "state",
    country: "country",
    email: "email",
    street_address: "streetAddress",
    postal_code: "postalCode"
  };

  if (!templateAttributes || templateAttributes.length === 0) {
    Object.entries(attributeMap).forEach(([templateKey, requestKey]) => {
      const value = request[requestKey];
      if (value && typeof value === "string") {
        subject[templateKey] = value;
      }
    });
    return subject;
  }

  templateAttributes.forEach((attr) => {
    if (attr.include === "prohibit") {
      return;
    }

    const requestKey = attributeMap[attr.type];
    const value = request[requestKey];

    if (value && typeof value === "string") {
      subject[attr.type] = value;
    }
  });

  return subject;
};

export const buildSubjectAlternativeNamesFromTemplate = (
  request: { subjectAlternativeNames?: Array<{ type: string; value: string }> },
  templateSans?: Array<{
    type: string;
    include: "mandatory" | "optional" | "prohibit";
    value?: string[];
  }>
): string => {
  if (!request.subjectAlternativeNames || request.subjectAlternativeNames.length === 0) {
    return "";
  }

  if (!templateSans || templateSans.length === 0) {
    return request.subjectAlternativeNames.map((san) => san.value).join(",");
  }

  const allowedSans: string[] = [];
  const prohibitedTypes = new Set(templateSans.filter((san) => san.include === "prohibit").map((san) => san.type));

  request.subjectAlternativeNames.forEach((san) => {
    const sanType = san.type === "dns_name" ? "dns_name" : san.type;
    if (!prohibitedTypes.has(sanType)) {
      allowedSans.push(san.value);
    }
  });

  return allowedSans.join(",");
};
