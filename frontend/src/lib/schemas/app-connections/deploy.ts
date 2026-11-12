import { z } from "zod";

import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { CircleCIConnectionMethod } from "@app/hooks/api/appConnections/types/circleci-connection";
import { Cloud66ConnectionMethod } from "@app/hooks/api/appConnections/types/cloud-66-connection";
import { ConvexConnectionMethod } from "@app/hooks/api/appConnections/types/convex-connection";
import { FlyioConnectionMethod } from "@app/hooks/api/appConnections/types/flyio-connection";
import { HasuraCloudConnectionMethod } from "@app/hooks/api/appConnections/types/hasura-cloud-connection";
import { HumanitecConnectionMethod } from "@app/hooks/api/appConnections/types/humanitec-connection";
import { LaravelForgeConnectionMethod } from "@app/hooks/api/appConnections/types/laravel-forge-connection";
import { NetlifyConnectionMethod } from "@app/hooks/api/appConnections/types/netlify-connection";
import { NorthflankConnectionMethod } from "@app/hooks/api/appConnections/types/northflank-connection";
import { OctopusDeployConnectionMethod } from "@app/hooks/api/appConnections/types/octopus-deploy-connection";
import { QoveryConnectionMethod } from "@app/hooks/api/appConnections/types/qovery-connection";
import { RailwayConnectionMethod } from "@app/hooks/api/appConnections/types/railway-connection";
import { RenderConnectionMethod } from "@app/hooks/api/appConnections/types/render-connection";
import { SpaceliftConnectionMethod } from "@app/hooks/api/appConnections/types/spacelift-connection";
import { SupabaseConnectionMethod } from "@app/hooks/api/appConnections/types/supabase-connection";
import { TeamCityConnectionMethod } from "@app/hooks/api/appConnections/types/teamcity-connection";
import { TerraformCloudConnectionMethod } from "@app/hooks/api/appConnections/types/terraform-cloud-connection";
import { TravisCIConnectionMethod } from "@app/hooks/api/appConnections/types/travis-ci-connection";
import { VercelConnectionMethod } from "@app/hooks/api/appConnections/types/vercel-connection";

import { genericAppConnectionFieldsSchema } from "./base";

const humanitecRootSchema = genericAppConnectionFieldsSchema.extend({
  app: z.literal(AppConnection.Humanitec)
});

export const humanitecConnectionFormSchema = z.discriminatedUnion("method", [
  humanitecRootSchema.extend({
    method: z.literal(HumanitecConnectionMethod.ApiToken),
    credentials: z.object({
      apiToken: z.string().trim().min(1, "Service API Token required")
    })
  })
]);

const terraformCloudRootSchema = genericAppConnectionFieldsSchema.extend({
  app: z.literal(AppConnection.TerraformCloud)
});

export const terraformCloudConnectionFormSchema = z.discriminatedUnion("method", [
  terraformCloudRootSchema.extend({
    method: z.literal(TerraformCloudConnectionMethod.ApiToken),
    credentials: z.object({
      apiToken: z.string().trim().min(1, "API Token required")
    })
  })
]);

const vercelRootSchema = genericAppConnectionFieldsSchema.extend({
  app: z.literal(AppConnection.Vercel)
});

export const vercelConnectionFormSchema = z.discriminatedUnion("method", [
  vercelRootSchema.extend({
    method: z.literal(VercelConnectionMethod.ApiToken),
    credentials: z.object({
      apiToken: z.string().trim().min(1, "Service API Token required")
    })
  })
]);

const teamCityRootSchema = genericAppConnectionFieldsSchema.extend({
  app: z.literal(AppConnection.TeamCity)
});

export const teamCityConnectionFormSchema = z.discriminatedUnion("method", [
  teamCityRootSchema.extend({
    method: z.literal(TeamCityConnectionMethod.AccessToken),
    credentials: z.object({
      accessToken: z.string().trim().min(1, "Access Token required"),
      instanceUrl: z.string().trim().url("Invalid Instance URL")
    })
  })
]);

const renderRootSchema = genericAppConnectionFieldsSchema.extend({
  app: z.literal(AppConnection.Render)
});

export const renderConnectionFormSchema = z.discriminatedUnion("method", [
  renderRootSchema.extend({
    method: z.literal(RenderConnectionMethod.ApiKey),
    credentials: z.object({
      apiKey: z.string().trim().min(1, "API Key required")
    })
  })
]);

const flyioRootSchema = genericAppConnectionFieldsSchema.extend({
  app: z.literal(AppConnection.Flyio)
});

export const flyioConnectionFormSchema = z.discriminatedUnion("method", [
  flyioRootSchema.extend({
    method: z.literal(FlyioConnectionMethod.AccessToken),
    credentials: z.object({
      accessToken: z
        .string()
        .trim()
        .min(1, "Access Token required")
        .startsWith("FlyV1", "Token must start with 'FlyV1'")
    })
  })
]);

const railwayRootSchema = genericAppConnectionFieldsSchema.extend({
  app: z.literal(AppConnection.Railway)
});

export const railwayConnectionFormSchema = z.discriminatedUnion("method", [
  railwayRootSchema.extend({
    method: z.nativeEnum(RailwayConnectionMethod),
    credentials: z.object({
      apiToken: z.string().trim().min(1, "Service API Token required")
    })
  })
]);

const supabaseRootSchema = genericAppConnectionFieldsSchema.extend({
  app: z.literal(AppConnection.Supabase)
});

export const supabaseConnectionFormSchema = z.discriminatedUnion("method", [
  supabaseRootSchema.extend({
    method: z.literal(SupabaseConnectionMethod.AccessToken),
    credentials: z.object({
      accessKey: z.string().trim().min(1, "Access Key required"),
      instanceUrl: z.string().url().optional()
    })
  })
]);

const netlifyRootSchema = genericAppConnectionFieldsSchema.extend({
  app: z.literal(AppConnection.Netlify)
});

export const netlifyConnectionFormSchema = z.discriminatedUnion("method", [
  netlifyRootSchema.extend({
    method: z.literal(NetlifyConnectionMethod.AccessToken),
    credentials: z.object({
      accessToken: z.string().trim().min(1, "Netlify Access Token required")
    })
  })
]);

const northflankRootSchema = genericAppConnectionFieldsSchema.extend({
  app: z.literal(AppConnection.Northflank)
});

export const northflankConnectionFormSchema = z.discriminatedUnion("method", [
  northflankRootSchema.extend({
    method: z.literal(NorthflankConnectionMethod.ApiToken),
    credentials: z.object({
      apiToken: z.string().trim().min(1, "API Token required")
    })
  })
]);

const laravelForgeRootSchema = genericAppConnectionFieldsSchema.extend({
  app: z.literal(AppConnection.LaravelForge)
});

export const laravelForgeConnectionFormSchema = z.discriminatedUnion("method", [
  laravelForgeRootSchema.extend({
    method: z.literal(LaravelForgeConnectionMethod.ApiToken),
    credentials: z.object({
      apiToken: z.string().trim().min(1, "API Token required")
    })
  })
]);

const octopusDeployRootSchema = genericAppConnectionFieldsSchema.extend({
  app: z.literal(AppConnection.OctopusDeploy)
});

export const octopusDeployConnectionFormSchema = z.discriminatedUnion("method", [
  octopusDeployRootSchema.extend({
    method: z.literal(OctopusDeployConnectionMethod.ApiKey),
    credentials: z.object({
      instanceUrl: z
        .string()
        .trim()
        .url("Invalid Instance URL")
        .min(1, "Instance URL required")
        .max(255),
      apiKey: z.string().trim().min(1, "API Key required")
    })
  })
]);

const circleCIRootSchema = genericAppConnectionFieldsSchema.extend({
  app: z.literal(AppConnection.CircleCI)
});

export const circleCIConnectionFormSchema = z.discriminatedUnion("method", [
  circleCIRootSchema.extend({
    method: z.literal(CircleCIConnectionMethod.ApiToken),
    credentials: z.object({
      host: z.string().trim().optional(),
      apiToken: z.string().trim().min(1, "API Token required")
    })
  })
]);

const travisCIRootSchema = genericAppConnectionFieldsSchema.extend({
  app: z.literal(AppConnection.TravisCI)
});

export const travisCIConnectionFormSchema = z.discriminatedUnion("method", [
  travisCIRootSchema.extend({
    method: z.literal(TravisCIConnectionMethod.ApiToken),
    credentials: z.object({
      apiToken: z.string().trim().min(1, "API Token required")
    })
  })
]);

const convexRootSchema = genericAppConnectionFieldsSchema.extend({
  app: z.literal(AppConnection.Convex)
});

export const convexConnectionFormSchema = z.discriminatedUnion("method", [
  convexRootSchema.extend({
    method: z.literal(ConvexConnectionMethod.PersonalAccessToken),
    credentials: z.object({
      accessToken: z.string().trim().min(1, "Access Token required"),
      instanceUrl: z
        .string()
        .trim()
        .transform((value) => value || undefined)
        .refine((value) => (!value ? true : z.string().url().safeParse(value).success), {
          message: "Invalid instance URL"
        })
        .optional()
    })
  })
]);

const hasuraCloudRootSchema = genericAppConnectionFieldsSchema.extend({
  app: z.literal(AppConnection.HasuraCloud)
});

export const hasuraCloudConnectionFormSchema = z.discriminatedUnion("method", [
  hasuraCloudRootSchema.extend({
    method: z.literal(HasuraCloudConnectionMethod.AccessToken),
    credentials: z.object({
      accessToken: z.string().trim().min(1, "Access Token required")
    })
  })
]);

const qoveryRootSchema = genericAppConnectionFieldsSchema.extend({
  app: z.literal(AppConnection.Qovery)
});

export const qoveryConnectionFormSchema = z.discriminatedUnion("method", [
  qoveryRootSchema.extend({
    method: z.literal(QoveryConnectionMethod.AccessToken),
    credentials: z.object({
      accessToken: z.string().trim().min(1, "Project Access Token required")
    })
  })
]);

const cloud66RootSchema = genericAppConnectionFieldsSchema.extend({
  app: z.literal(AppConnection.Cloud66)
});

export const cloud66ConnectionFormSchema = z.discriminatedUnion("method", [
  cloud66RootSchema.extend({
    method: z.literal(Cloud66ConnectionMethod.AccessToken),
    credentials: z.object({
      accessToken: z.string().trim().min(1, "Personal Access Token required")
    })
  })
]);

const spaceliftRootSchema = genericAppConnectionFieldsSchema.extend({
  app: z.literal(AppConnection.Spacelift)
});

export const spaceliftConnectionFormSchema = z.discriminatedUnion("method", [
  spaceliftRootSchema.extend({
    method: z.literal(SpaceliftConnectionMethod.ApiKeySecret),
    credentials: z.object({
      apiUrl: z.string().trim().url("Must be a valid URL").min(1, "API URL required"),
      apiKeyId: z.string().trim().min(1, "API Key ID required"),
      apiKeySecret: z.string().trim().min(1, "API Key Secret required")
    })
  })
]);
