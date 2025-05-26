import { z } from "zod";

export type TPasswordRequirements = z.infer<typeof PasswordRequirementsSchema>;

export const PasswordRequirementsSchema = z
  .object({
    length: z
      .number()
      .min(1, "Password length must be a positive number")
      .max(250, "Password length must be less than 250"),
    required: z.object({
      digits: z.number().min(0, "Digit count must be non-negative"),
      lowercase: z.number().min(0, "Lowercase count must be non-negative"),
      uppercase: z.number().min(0, "Uppercase count must be non-negative"),
      symbols: z.number().min(0, "Symbol count must be non-negative")
    }),
    allowedSymbols: z
      .string()
      .regex(/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?~]/, "Invalid symbols")
      .optional()
      .transform((value) => value || "-_.~!*")
  })
  .refine(
    (data) => {
      return Object.values(data.required).some((count) => count > 0);
    },
    {
      message: "At least one character type must be required",
      path: ["required.digits"]
    }
  )
  .refine(
    (data) => {
      const total = Object.values(data.required).reduce((sum, count) => sum + count, 0);
      return total <= data.length;
    },
    { message: "Sum of required characters cannot exceed the total length", path: ["length"] }
  );

export const DEFAULT_PASSWORD_REQUIREMENTS = {
  length: 48,
  required: {
    lowercase: 1,
    uppercase: 1,
    digits: 1,
    symbols: 0
  },
  allowedSymbols: "-_.~!*"
};
