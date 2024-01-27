import type { Request } from "express";
import { AnyZodObject, ZodError, z } from "zod";
import { BadRequestError } from "../utils/errors";

export async function validateRequest<T extends AnyZodObject>(
  schema: T,
  req: Request
): Promise<z.infer<T>> {
  try {
    return schema.parseAsync(req);
  } catch (error) {
    if (error instanceof ZodError) {
      throw BadRequestError({ message: error.message });
    }
    return BadRequestError({ message: JSON.stringify(error) });
  }
}
