import { z } from "zod";

import { AcmeDnsProvider, CaStatus, CaType, GoDaddyProductType } from "@app/hooks/api/ca";
import { DigiCertCaPurpose } from "@app/hooks/api/ca/types";
import { slugSchema } from "@app/lib/schemas";

import { REQUIRED_EAB_DIRECTORIES } from "./constants";

const baseSchema = z.object({
  type: z.nativeEnum(CaType),
  name: slugSchema({
    field: "Name"
  }),
  status: z.nativeEnum(CaStatus)
});

const acmeConfigurationSchema = z
  .object({
    dnsAppConnection: z.object({
      id: z.string(),
      name: z.string()
    }),
    dnsProviderConfig: z.object({
      provider: z.nativeEnum(AcmeDnsProvider),
      hostedZoneId: z.string()
    }),
    directoryUrl: z.string(),
    accountEmail: z.string(),
    eabKid: z.string().optional(),
    eabHmacKey: z.string().optional(),
    dnsResolver: z
      .string()
      .ip({ message: "Must be a valid IP address" })
      .or(z.literal(""))
      .optional()
  })
  .superRefine((data, ctx) => {
    if (REQUIRED_EAB_DIRECTORIES.includes(data.directoryUrl)) {
      if (!data.eabKid || data.eabKid.trim() === "") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "EAB Key Identifier (KID) is required for this directory URL",
          path: ["eabKid"]
        });
      }
    }
  });

const azureAdCsConfigurationSchema = z.object({
  azureAdcsConnection: z.object({
    id: z.string(),
    name: z.string()
  })
});

const adcsConfigurationSchema = z.object({
  adcsConnection: z.object({
    id: z.string().min(1, "ADCS Connection is required"),
    name: z.string()
  }),
  caName: z.string().trim().optional()
});

const awsPcaConfigurationSchema = z.object({
  awsConnection: z.object({
    id: z.string().min(1, "AWS Connection is required"),
    name: z.string()
  }),
  certificateAuthorityArn: z.string().trim().min(1, "Certificate Authority ARN is required"),
  region: z.string().min(1, "Region is required")
});

const digicertConfigurationSchema = z
  .object({
    digicertConnection: z.object({
      id: z.string().min(1, "DigiCert Connection is required"),
      name: z.string()
    }),
    organizationId: z.coerce.number().int().positive("Organization is required"),
    productNameId: z.string().trim().min(1, "Product is required"),
    purpose: z.nativeEnum(DigiCertCaPurpose).optional(),
    csRequiresContact: z.boolean().optional(),
    verifiedContact: z
      .object({
        firstName: z.string().trim().max(128).optional(),
        lastName: z.string().trim().max(128).optional(),
        email: z.string().trim().max(255).optional(),
        jobTitle: z.string().trim().max(64).optional(),
        telephone: z.string().trim().max(32).optional()
      })
      .optional()
  })
  .superRefine((cfg, ctx) => {
    if (cfg.purpose !== DigiCertCaPurpose.CodeSigning || !cfg.csRequiresContact) return;
    const c = cfg.verifiedContact;
    const requiredFields: { key: keyof NonNullable<typeof c>; label: string }[] = [
      { key: "firstName", label: "First Name" },
      { key: "lastName", label: "Last Name" },
      { key: "email", label: "Email" },
      { key: "jobTitle", label: "Job Title" },
      { key: "telephone", label: "Telephone" }
    ];
    requiredFields.forEach(({ key, label }) => {
      if (!c?.[key] || c[key]?.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["verifiedContact", key],
          message: `${label} is required for code signing CAs`
        });
      }
    });
    if (c?.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["verifiedContact", "email"],
        message: "Email must be valid"
      });
    }
  });

const awsAcmPublicCaConfigurationSchema = z.object({
  awsConnection: z.object({
    id: z.string().min(1, "AWS Connection is required"),
    name: z.string()
  }),
  dnsConnection: z.object({
    id: z.string().min(1, "Route 53 Connection is required"),
    name: z.string()
  }),
  hostedZoneId: z.string().trim().min(1, "Hosted Zone ID is required"),
  region: z.string().min(1, "Region is required")
});

const venafiTppConfigurationSchema = z.object({
  venafiTppConnection: z.object({
    id: z.string().min(1, "Venafi TPP Connection is required"),
    name: z.string()
  }),
  policyDN: z.string().trim().min(1, "Policy DN is required")
});

const godaddyConfigurationSchema = z.object({
  godaddyConnection: z.object({
    id: z.string().min(1, "GoDaddy Connection is required"),
    name: z.string()
  }),
  productType: z.nativeEnum(GoDaddyProductType)
});

export const schema = z.discriminatedUnion("type", [
  baseSchema.extend({
    type: z.literal(CaType.ACME),
    configuration: acmeConfigurationSchema
  }),
  baseSchema.extend({
    type: z.literal(CaType.AZURE_AD_CS),
    configuration: azureAdCsConfigurationSchema
  }),
  baseSchema.extend({
    type: z.literal(CaType.ADCS),
    configuration: adcsConfigurationSchema
  }),
  baseSchema.extend({
    type: z.literal(CaType.AWS_PCA),
    configuration: awsPcaConfigurationSchema
  }),
  baseSchema.extend({
    type: z.literal(CaType.DIGICERT),
    configuration: digicertConfigurationSchema
  }),
  baseSchema.extend({
    type: z.literal(CaType.AWS_ACM_PUBLIC_CA),
    configuration: awsAcmPublicCaConfigurationSchema
  }),
  baseSchema.extend({
    type: z.literal(CaType.VENAFI_TPP),
    configuration: venafiTppConfigurationSchema
  }),
  baseSchema.extend({
    type: z.literal(CaType.GODADDY),
    configuration: godaddyConfigurationSchema
  })
]);

export type FormData = z.infer<typeof schema>;
