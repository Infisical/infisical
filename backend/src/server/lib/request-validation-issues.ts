import { hasZodFastifySchemaValidationErrors } from "@fastify/type-provider-zod";

export type TRequestValidationIssue = { code: string; message: string; path: string[] } & Record<string, unknown>;

export const getRequestValidationIssues = (error: unknown): TRequestValidationIssue[] | null => {
  if (!hasZodFastifySchemaValidationErrors(error)) return null;
  return error.validation.map(({ keyword, message, instancePath, params }) => ({
    ...params,
    code: keyword,
    message: message ?? "Invalid input",
    path: instancePath.split("/").slice(1).filter(Boolean)
  }));
};
