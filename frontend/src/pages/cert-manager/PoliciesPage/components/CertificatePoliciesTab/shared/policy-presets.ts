import {
  ALGORITHM_FAMILIES,
  CertDurationUnit,
  CertExtendedKeyUsageType,
  CertKeyUsageType,
  CertPolicyState,
  CertSanInclude,
  CertSubjectAlternativeNameType,
  CertSubjectAttributeInclude,
  CertSubjectAttributeType,
  POLICY_PRESET_IDS,
  type PolicyPresetId
} from "./certificate-constants";
import { PolicyFormData } from ".";

export interface CertificatePolicyPreset {
  readonly id: PolicyPresetId;
  readonly name: string;
  readonly description: string;
  readonly useCase: string;
  readonly formData: Omit<PolicyFormData, "preset">;
}

export const CERTIFICATE_POLICY_PRESETS: CertificatePolicyPreset[] = [
  {
    id: POLICY_PRESET_IDS.TLS_SERVER,
    name: "TLS Server Certificate",
    description: "Standard TLS/SSL server certificate for HTTPS services and API endpoints.",
    useCase: "Web servers, API endpoints, HTTPS services",
    formData: {
      name: "TLS Server Certificate",
      description: "Standard TLS/SSL server certificate for HTTPS services and API endpoints.",
      keyUsages: {
        requiredUsages: [CertKeyUsageType.DIGITAL_SIGNATURE],
        optionalUsages: [CertKeyUsageType.DIGITAL_SIGNATURE, CertKeyUsageType.KEY_ENCIPHERMENT]
      },
      extendedKeyUsages: {
        requiredUsages: [CertExtendedKeyUsageType.SERVER_AUTH],
        optionalUsages: [CertExtendedKeyUsageType.SERVER_AUTH]
      },
      validity: {
        maxDuration: {
          value: 365,
          unit: CertDurationUnit.DAYS
        }
      },
      attributes: [
        {
          type: CertSubjectAttributeType.COMMON_NAME,
          include: CertSubjectAttributeInclude.OPTIONAL,
          value: ["*"]
        }
      ],
      subjectAlternativeNames: [
        {
          type: CertSubjectAlternativeNameType.DNS_NAME,
          include: CertSanInclude.OPTIONAL,
          value: ["*"]
        },
        {
          type: CertSubjectAlternativeNameType.IP_ADDRESS,
          include: CertSanInclude.OPTIONAL,
          value: ["*"]
        }
      ],
      signatureAlgorithm: {
        allowedAlgorithms: [...ALGORITHM_FAMILIES.ECDSA.signature]
      },
      keyAlgorithm: {
        allowedKeyTypes: [...ALGORITHM_FAMILIES.ECDSA.key]
      }
    }
  },
  {
    id: POLICY_PRESET_IDS.TLS_CLIENT,
    name: "TLS Client Certificate",
    description: "Client certificate for mutual TLS authentication and API access.",
    useCase: "Client authentication, mTLS, API authentication",
    formData: {
      name: "TLS Client Certificate",
      description: "Client certificate for mutual TLS authentication and API access.",
      keyUsages: {
        requiredUsages: [CertKeyUsageType.DIGITAL_SIGNATURE],
        optionalUsages: [CertKeyUsageType.DIGITAL_SIGNATURE, CertKeyUsageType.KEY_AGREEMENT]
      },
      extendedKeyUsages: {
        requiredUsages: [CertExtendedKeyUsageType.CLIENT_AUTH],
        optionalUsages: [CertExtendedKeyUsageType.CLIENT_AUTH]
      },
      validity: {
        maxDuration: {
          value: 365,
          unit: CertDurationUnit.DAYS
        }
      },
      attributes: [
        {
          type: CertSubjectAttributeType.COMMON_NAME,
          include: CertSubjectAttributeInclude.OPTIONAL,
          value: ["*"]
        }
      ],
      subjectAlternativeNames: [
        {
          type: CertSubjectAlternativeNameType.EMAIL,
          include: CertSanInclude.OPTIONAL,
          value: ["*"]
        },
        {
          type: CertSubjectAlternativeNameType.DNS_NAME,
          include: CertSanInclude.OPTIONAL,
          value: ["*"]
        }
      ],
      signatureAlgorithm: {
        allowedAlgorithms: [...ALGORITHM_FAMILIES.ECDSA.signature]
      },
      keyAlgorithm: {
        allowedKeyTypes: [...ALGORITHM_FAMILIES.ECDSA.key]
      }
    }
  },
  {
    id: POLICY_PRESET_IDS.CODE_SIGNING,
    name: "Code Signing Certificate",
    description:
      "Certificate for signing software, executables, and packages. Requires hardware security modules.",
    useCase: "Software signing, executable authentication, package validation",
    formData: {
      name: "Code Signing Certificate",
      description:
        "Certificate for signing software, executables, and packages. Requires hardware security modules.",
      keyUsages: {
        requiredUsages: [CertKeyUsageType.DIGITAL_SIGNATURE, CertKeyUsageType.NON_REPUDIATION],
        optionalUsages: [CertKeyUsageType.DIGITAL_SIGNATURE, CertKeyUsageType.NON_REPUDIATION]
      },
      extendedKeyUsages: {
        requiredUsages: [CertExtendedKeyUsageType.CODE_SIGNING],
        optionalUsages: [
          CertExtendedKeyUsageType.CODE_SIGNING,
          CertExtendedKeyUsageType.TIME_STAMPING
        ]
      },
      validity: {
        maxDuration: {
          value: 365,
          unit: CertDurationUnit.DAYS
        }
      },
      attributes: [
        {
          type: CertSubjectAttributeType.COMMON_NAME,
          include: CertSubjectAttributeInclude.OPTIONAL,
          value: ["*"]
        }
      ],
      subjectAlternativeNames: [
        {
          type: CertSubjectAlternativeNameType.EMAIL,
          include: CertSanInclude.OPTIONAL,
          value: ["*"]
        }
      ],
      signatureAlgorithm: {
        allowedAlgorithms: [...ALGORITHM_FAMILIES.RSA.signature]
      },
      keyAlgorithm: {
        allowedKeyTypes: [...ALGORITHM_FAMILIES.RSA.key]
      }
    }
  },
  {
    id: POLICY_PRESET_IDS.DEVICE,
    name: "Device Certificate",
    description:
      "Certificate for IoT devices and embedded systems authentication. IEEE 802.1AR compliant.",
    useCase: "Device authentication, IoT security, embedded systems",
    formData: {
      name: "Device Certificate",
      description:
        "Certificate for IoT devices and embedded systems authentication. IEEE 802.1AR compliant.",
      keyUsages: {
        requiredUsages: [CertKeyUsageType.DIGITAL_SIGNATURE],
        optionalUsages: [CertKeyUsageType.DIGITAL_SIGNATURE, CertKeyUsageType.KEY_AGREEMENT]
      },
      extendedKeyUsages: {
        requiredUsages: [CertExtendedKeyUsageType.CLIENT_AUTH],
        optionalUsages: [CertExtendedKeyUsageType.CLIENT_AUTH, CertExtendedKeyUsageType.SERVER_AUTH]
      },
      validity: {
        maxDuration: {
          value: 365,
          unit: CertDurationUnit.DAYS
        }
      },
      attributes: [
        {
          type: CertSubjectAttributeType.COMMON_NAME,
          include: CertSubjectAttributeInclude.OPTIONAL,
          value: ["*"]
        }
      ],
      subjectAlternativeNames: [
        {
          type: CertSubjectAlternativeNameType.DNS_NAME,
          include: CertSanInclude.OPTIONAL,
          value: ["*"]
        },
        {
          type: CertSubjectAlternativeNameType.IP_ADDRESS,
          include: CertSanInclude.OPTIONAL,
          value: ["*"]
        }
      ],
      signatureAlgorithm: {
        allowedAlgorithms: [...ALGORITHM_FAMILIES.ECDSA.signature]
      },
      keyAlgorithm: {
        allowedKeyTypes: [...ALGORITHM_FAMILIES.ECDSA.key]
      }
    }
  },
  {
    id: POLICY_PRESET_IDS.USER,
    name: "User Certificate",
    description:
      "Personal certificate for user authentication and email signing. FIPS 201 PIV compliant.",
    useCase: "Personal authentication, smart cards, email protection",
    formData: {
      name: "User Certificate",
      description:
        "Personal certificate for user authentication and email signing. FIPS 201 PIV compliant.",
      keyUsages: {
        requiredUsages: [CertKeyUsageType.DIGITAL_SIGNATURE],
        optionalUsages: [
          CertKeyUsageType.DIGITAL_SIGNATURE,
          CertKeyUsageType.KEY_ENCIPHERMENT,
          CertKeyUsageType.KEY_AGREEMENT
        ]
      },
      extendedKeyUsages: {
        requiredUsages: [
          CertExtendedKeyUsageType.CLIENT_AUTH,
          CertExtendedKeyUsageType.EMAIL_PROTECTION
        ],
        optionalUsages: [
          CertExtendedKeyUsageType.CLIENT_AUTH,
          CertExtendedKeyUsageType.EMAIL_PROTECTION
        ]
      },
      validity: {
        maxDuration: {
          value: 365,
          unit: CertDurationUnit.DAYS
        }
      },
      attributes: [
        {
          type: CertSubjectAttributeType.COMMON_NAME,
          include: CertSubjectAttributeInclude.OPTIONAL,
          value: ["*"]
        }
      ],
      subjectAlternativeNames: [
        {
          type: CertSubjectAlternativeNameType.EMAIL,
          include: CertSanInclude.OPTIONAL,
          value: ["*"]
        }
      ],
      signatureAlgorithm: {
        allowedAlgorithms: [...ALGORITHM_FAMILIES.ECDSA.signature]
      },
      keyAlgorithm: {
        allowedKeyTypes: [...ALGORITHM_FAMILIES.ECDSA.key]
      }
    }
  },
  {
    id: POLICY_PRESET_IDS.EMAIL_PROTECTION,
    name: "Email Protection Certificate",
    description: "S/MIME certificate for email encryption and digital signing. RFC 8550 compliant.",
    useCase: "Email encryption, digital signing, secure messaging",
    formData: {
      name: "Email Protection Certificate",
      description:
        "S/MIME certificate for email encryption and digital signing. RFC 8550 compliant.",
      keyUsages: {
        requiredUsages: [CertKeyUsageType.DIGITAL_SIGNATURE],
        optionalUsages: [
          CertKeyUsageType.DIGITAL_SIGNATURE,
          CertKeyUsageType.KEY_ENCIPHERMENT,
          CertKeyUsageType.KEY_AGREEMENT
        ]
      },
      extendedKeyUsages: {
        requiredUsages: [CertExtendedKeyUsageType.EMAIL_PROTECTION],
        optionalUsages: [CertExtendedKeyUsageType.EMAIL_PROTECTION]
      },
      validity: {
        maxDuration: {
          value: 365,
          unit: CertDurationUnit.DAYS
        }
      },
      attributes: [
        {
          type: CertSubjectAttributeType.COMMON_NAME,
          include: CertSubjectAttributeInclude.OPTIONAL,
          value: ["*"]
        }
      ],
      subjectAlternativeNames: [
        {
          type: CertSubjectAlternativeNameType.EMAIL,
          include: CertSanInclude.OPTIONAL,
          value: ["*"]
        }
      ],
      signatureAlgorithm: {
        allowedAlgorithms: [...ALGORITHM_FAMILIES.RSA.signature]
      },
      keyAlgorithm: {
        allowedKeyTypes: [...ALGORITHM_FAMILIES.RSA.key]
      }
    }
  },
  {
    id: POLICY_PRESET_IDS.DUAL_PURPOSE_SERVER,
    name: "Dual-Purpose Server Certificate",
    description:
      "Certificate for services requiring both server and client authentication capabilities",
    useCase: "Microservices, service mesh, dual authentication",
    formData: {
      name: "Dual-Purpose Server Certificate",
      description:
        "Certificate for services requiring both server and client authentication capabilities",
      keyUsages: {
        requiredUsages: [CertKeyUsageType.DIGITAL_SIGNATURE],
        optionalUsages: [
          CertKeyUsageType.DIGITAL_SIGNATURE,
          CertKeyUsageType.KEY_ENCIPHERMENT,
          CertKeyUsageType.KEY_AGREEMENT
        ]
      },
      extendedKeyUsages: {
        requiredUsages: [
          CertExtendedKeyUsageType.SERVER_AUTH,
          CertExtendedKeyUsageType.CLIENT_AUTH
        ],
        optionalUsages: [CertExtendedKeyUsageType.SERVER_AUTH, CertExtendedKeyUsageType.CLIENT_AUTH]
      },
      validity: {
        maxDuration: {
          value: 365,
          unit: CertDurationUnit.DAYS
        }
      },
      attributes: [
        {
          type: CertSubjectAttributeType.COMMON_NAME,
          include: CertSubjectAttributeInclude.OPTIONAL,
          value: ["*"]
        }
      ],
      subjectAlternativeNames: [
        {
          type: CertSubjectAlternativeNameType.DNS_NAME,
          include: CertSanInclude.OPTIONAL,
          value: ["*"]
        },
        {
          type: CertSubjectAlternativeNameType.IP_ADDRESS,
          include: CertSanInclude.OPTIONAL,
          value: ["*"]
        }
      ],
      signatureAlgorithm: {
        allowedAlgorithms: [...ALGORITHM_FAMILIES.ECDSA.signature]
      },
      keyAlgorithm: {
        allowedKeyTypes: [...ALGORITHM_FAMILIES.ECDSA.key]
      }
    }
  },
  {
    id: POLICY_PRESET_IDS.INTERMEDIATE_CA,
    name: "Intermediate CA Certificate",
    description:
      "Certificate for intermediate Certificate Authorities. Allows signing end-entity certificates and CRLs.",
    useCase: "Intermediate CA, subordinate CA, issuing CA",
    formData: {
      name: "Intermediate CA Certificate",
      description:
        "Certificate for intermediate Certificate Authorities. Allows signing end-entity certificates and CRLs.",
      basicConstraints: {
        isCA: CertPolicyState.REQUIRED,
        maxPathLength: 0
      },
      keyUsages: {
        requiredUsages: [CertKeyUsageType.KEY_CERT_SIGN, CertKeyUsageType.CRL_SIGN],
        optionalUsages: [
          CertKeyUsageType.KEY_CERT_SIGN,
          CertKeyUsageType.CRL_SIGN,
          CertKeyUsageType.DIGITAL_SIGNATURE
        ]
      },
      extendedKeyUsages: {
        requiredUsages: [],
        optionalUsages: [CertExtendedKeyUsageType.OCSP_SIGNING]
      },
      validity: {
        maxDuration: {
          value: 10,
          unit: CertDurationUnit.YEARS
        }
      },
      attributes: [
        {
          type: CertSubjectAttributeType.COMMON_NAME,
          include: CertSubjectAttributeInclude.OPTIONAL,
          value: ["*"]
        },
        {
          type: CertSubjectAttributeType.ORGANIZATION,
          include: CertSubjectAttributeInclude.OPTIONAL,
          value: ["*"]
        }
      ],
      subjectAlternativeNames: [],
      signatureAlgorithm: {
        allowedAlgorithms: [
          ...ALGORITHM_FAMILIES.RSA.signature,
          ...ALGORITHM_FAMILIES.ECDSA.signature
        ]
      },
      keyAlgorithm: {
        allowedKeyTypes: [...ALGORITHM_FAMILIES.RSA.key, ...ALGORITHM_FAMILIES.ECDSA.key]
      }
    }
  }
];
