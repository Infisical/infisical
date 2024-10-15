import { z } from "zod";
import { ConsumerSecretsSchema } from "@app/db/schemas/consumer-secrets";
import { TOrgPermission } from "@app/lib/types";

export enum ConsumerSecretTypes {
  WebLogin = "web_login",
  CreditCard = "credit_card",
  PrivateNote = "private_note"
}

export type ConsumerSecretWebLogin = {
type: ConsumerSecretTypes.WebLogin;
url: string;
username: string;
password: string;
};

export type ConsumerSecretCreditCard = {
type: ConsumerSecretTypes.CreditCard;
nameOnCard: string;
cardNumber: string;
validThrough: string;
cvv: string;
};

export type ConsumerSecretPrivateNote = {
type: ConsumerSecretTypes.PrivateNote;
title: string;
content: string;
};

const baseSchema = z.object({
  type: z.enum([
    ConsumerSecretTypes.WebLogin,
    ConsumerSecretTypes.CreditCard,
    ConsumerSecretTypes.PrivateNote
  ]),
});

// Specific schemas
const loginCredentialsSchema = baseSchema.extend({
  type: z.literal(ConsumerSecretTypes.WebLogin),
  url: z.string().url("Must be a valid URL"),
  username: z.string().min(1, "User is required"),
  password: z.string().min(1, "Passphrase is required")
});

const creditCardSchema = baseSchema.extend({
  type: z.literal(ConsumerSecretTypes.CreditCard),
  nameOnCard: z.string().min(1, "Card holder name is required"),
  cardNumber: z.string().regex(/^\d{13,19}$/, "Invalid card number"),
  validThrough: z.string().regex(/^(0[1-9]|1[0-2])\/\d{2}$/, "Invalid expiration date (MM/YY)"),
  cvv: z.string().regex(/^\d{3,4}$/, "Invalid security code")
});

const privateNoteSchema = baseSchema.extend({
  type: z.literal(ConsumerSecretTypes.PrivateNote),
  title: z.string().min(1, "Text is required"),
  content: z.string().min(1, "Text is required"),
});

// Union type for secret details
export type SecretTypeUnion = 
  | z.infer<typeof loginCredentialsSchema>
  | z.infer<typeof creditCardSchema>
  | z.infer<typeof privateNoteSchema>;

// DTO Types
export type TCreateConsumerSecretDTO = {
  name: string;
  data: SecretTypeUnion;
} & TOrgPermission;

export type TListConsumerSecretDTO = {
  offset: number;
  limit: number;
} & TOrgPermission;

export type TUpdateConsumerSecretDTO = {
  id: string;
  name?: string;
  data?: SecretTypeUnion;
} & TOrgPermission;

export type TDeleteConsumerSecretDTO = {
  id: string;
};

// Create and Update Schemas
export const CreateSecretSchema = z.object({
  name: z.string().trim().min(1, "Title is required"),
  data: z.discriminatedUnion("type", [loginCredentialsSchema, creditCardSchema, privateNoteSchema])
});

export const UpdateSecretSchema = z.object({
  name: z.string().trim().optional(),
  data: z.discriminatedUnion("type", [loginCredentialsSchema, creditCardSchema, privateNoteSchema]).optional()
});

// Sanitized Secret Schema
export const SanitizedSecretSchema = ConsumerSecretsSchema.pick({
  id: true,
  title: true,
  type: true
}).extend({
  data: z.discriminatedUnion("type", [loginCredentialsSchema, creditCardSchema, privateNoteSchema])
});
