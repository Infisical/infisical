import { z } from "zod";

import { AwsHoneyTokenSchema } from "./aws-honey-token-schema";

export const HoneyTokenFormSchema = z.discriminatedUnion("type", [AwsHoneyTokenSchema]);

export type THoneyTokenForm = z.infer<typeof HoneyTokenFormSchema>;

export { AwsHoneyTokenSchema };
