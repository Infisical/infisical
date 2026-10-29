import { z } from "zod";

import { DELEGATED_APPROVAL_PROVIDER_RECORD_NUMBER_MAX_CHARS } from "../../dispatch/delegated-approval-dispatch-constants";
import { SERVICENOW_PERMISSIONS_MAX_CHARS } from "./servicenow-constants";
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
  permissions: z
    .string()
    .array()
    .refine(
      (lines) => lines.join("\n").length < SERVICENOW_PERMISSIONS_MAX_CHARS,
      "The permission list is too long for ServiceNow to store. Split it into smaller requests"
    )
    .optional(),
  requestor_name: z.string().min(1).max(255).optional(),
  is_temporary: z.boolean().optional(),
  temporary_range: z.string().min(1).max(50).optional(),
  justification: z.string().optional()
});

// `request_number` is display only, so a bad value must never fail the parse that `sys_id` depends on.
export const ServiceNowAccessRequestResponseSchema = z.object({
  sys_id: z.string().min(1),
  request_number: z.string().max(DELEGATED_APPROVAL_PROVIDER_RECORD_NUMBER_MAX_CHARS).nullish().catch(undefined)
});

export const ServiceNowErrorResponseSchema = z.object({
  error: z.unknown().optional()
});

const ServiceNowNullableText = z.string().max(SERVICENOW_PERMISSIONS_MAX_CHARS).nullable().optional();

// The read projection of the Infisical Approvals ServiceNow application. Every field arrives as a
// string, and an empty field as null.
export const ServiceNowAccessResponseRecordSchema = z.object({
  success: z.boolean().optional(),
  data: z.object({
    sys_id: ServiceNowNullableText,
    request_id: ServiceNowNullableText,
    permissions: ServiceNowNullableText,
    state: z.string().max(100).nullable().optional(),
    decision: ServiceNowNullableText,
    approved_by: ServiceNowNullableText,
    decision_date: ServiceNowNullableText,
    decision_notes: ServiceNowNullableText
  })
});
