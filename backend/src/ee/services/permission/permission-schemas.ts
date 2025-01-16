import { z } from "zod";

export const CASL_ACTION_SCHEMA_NATIVE_ENUM = <ACTION extends z.EnumLike>(actions: ACTION) =>
  z
    .union([z.nativeEnum(actions), z.nativeEnum(actions).array().min(1)])
    .transform((el) => (typeof el === "string" ? [el] : el));

export const CASL_ACTION_SCHEMA_ENUM = <ACTION extends z.EnumValues>(actions: ACTION) =>
  z.union([z.enum(actions), z.enum(actions).array().min(1)]).transform((el) => (typeof el === "string" ? [el] : el));
