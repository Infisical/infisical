import { z } from "zod";

import { ServiceNowRequestType } from "./servicenow-enums";

// Mirrors what the Infisical Approvals ServiceNow application accepts, so a request that would be
// rejected there fails here with the field named instead of as an opaque 400.
export const ServiceNowAccessRequestPayloadSchema = z.object({
  request_id: z.string().min(1).max(255),
  callback_url: z
    .string()
    .max(1000)
    .url()
    .refine((value) => value.startsWith("https://"), "Callback URL must use HTTPS"),
  callback_token: z.string().min(1).max(1000),
  event: z.string().min(1).max(255),
  request_type: z.nativeEnum(ServiceNowRequestType),
  product_type: z.string().min(1).max(100),
  project_id: z.string().min(1).max(255),
  project_name: z.string().min(1).max(255),
  environment: z.string().min(1).max(100),
  requestor_email: z.string().min(1).max(255),
  secret_path: z.string().optional(),
  permissions: z.string().array().optional(),
  requestor_name: z.string().min(1).max(255).optional(),
  is_temporary: z.boolean().optional(),
  temporary_range: z.string().min(1).max(50).optional(),
  justification: z.string().optional()
});

export const ServiceNowAccessRequestResponseSchema = z.object({
  sys_id: z.string().min(1)
});

export const ServiceNowErrorResponseSchema = z.object({
  error: z.unknown().optional()
});
