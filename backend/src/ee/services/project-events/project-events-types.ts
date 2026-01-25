import { z } from "zod";

// Mutation types for discriminated union
export enum ProjectEvents {
  SecretCreate = "secret:create",
  SecretUpdate = "secret:update",
  SecretDelete = "secret:delete",
  SecretImportMutation = "secret:import-mutation"
}

// Base fields for all secret mutations
interface SecretMutationBase {
  projectId: string;
  secretPath: string;
  environment: string;
}

// Payload for created - includes secretKey
interface SecretCreatedPayload extends SecretMutationBase {
  type: ProjectEvents.SecretCreate;
  secretKey: string;
}

// Payload for updated - includes secretKey
interface SecretUpdatedPayload extends SecretMutationBase {
  type: ProjectEvents.SecretUpdate;
  secretKey: string;
}

// Payload for deleted - includes secretKey
interface SecretDeletedPayload extends SecretMutationBase {
  type: ProjectEvents.SecretDelete;
  secretKey: string;
}

// Payload for import mutation - NO secretKey
interface SecretImportMutationPayload extends SecretMutationBase {
  type: ProjectEvents.SecretImportMutation;
}

// Discriminated union of all mutation payloads
export type TProjectEventPayload =
  | SecretCreatedPayload
  | SecretUpdatedPayload
  | SecretDeletedPayload
  | SecretImportMutationPayload;

// Subscriber callback type
export type TProjectEventSubscriber = (payload: TProjectEventPayload) => void | Promise<void>;

// Unsubscribe function type
export type TProjectEventUnsubscribe = () => void;

export const ProjectEventRegisterSchema = z.object({
  event: z.nativeEnum(ProjectEvents),
  conditions: z
    .object({
      secretPath: z.string().optional().default("/"),
      environmentSlug: z.string()
    })
    .optional()
});
