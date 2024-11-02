import { z } from "zod";

export type SecretType = "webLogin" | "creditCard" | "secureNote";

export const userSecretSharedDataSchema = z.object({
  id: z.string().uuid(),
  name: z.string()
});

export type UserSecretSharedData = z.infer<typeof userSecretSharedDataSchema>;

export const webLoginSchema = userSecretSharedDataSchema.extend({
  type: z.literal("webLogin"),
  password: z.string().min(1, "Password is required"),
  username: z.string().optional()
});

export type WebLogin = z.infer<typeof webLoginSchema>;

export const creditCardSchema = userSecretSharedDataSchema.extend({
  type: z.literal("creditCard"),
  cardNumber: z.string().min(1, "Card number is required"),
  expiryDate: z.string().optional(),
  cvv: z.string().optional()
});

export type CreditCard = z.infer<typeof creditCardSchema>;

export const secureNoteSchema = userSecretSharedDataSchema.extend({
  type: z.literal("secureNote"),
  content: z.string().min(1, "Content is required")
});

export type SecureNote = z.infer<typeof secureNoteSchema>;

export const userSecretSchema = z.discriminatedUnion("type", [webLoginSchema, creditCardSchema, secureNoteSchema]);

export type UserSecret = z.infer<typeof userSecretSchema>;

export const newUserSecretDTOSchema = z.discriminatedUnion("type", [
  webLoginSchema.omit({ id: true }),
  creditCardSchema.omit({ id: true }),
  secureNoteSchema.omit({ id: true })
]);

export type NewUserSecretDTO = z.infer<typeof newUserSecretDTOSchema>;

export type NewUserSecret = {
  name: string;
  type: SecretType;
  ciphertext: string;
  iv: string;
  tag: string;
  extraData: object;
};
