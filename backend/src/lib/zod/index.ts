import RE2 from "re2";
import { z } from "zod";

type TTransformCtx = { addIssue: (issue: { code: "custom"; message: string; path?: PropertyKey[] }) => void };

// A codec that runs `transform` on both decode (requests) and encode (responses), which is how
// .transform() behaved under Zod 3's parse. Response serialization uses z.encode, and a plain
// .transform() throws there.
export const bidirectionalTransform = <S extends z.ZodType, Out>(
  schema: S,
  transform: (value: z.output<S>, ctx: TTransformCtx) => Out
) => {
  const run = (value: unknown, payload: { issues: unknown[] }) =>
    transform(value as z.output<S>, {
      addIssue: (issue) => payload.issues.push({ ...issue, input: value })
    }) as never;
  return z.codec(schema, schema, { decode: run, encode: run }) as unknown as z.ZodType<Out, z.input<S>>;
};

// this is a patched zod string to remove empty string to undefined
export const zpStr = <T extends z.ZodType>(schema: T, opt: { stripNull: boolean } = { stripNull: true }) =>
  z.preprocess((val) => {
    if (opt.stripNull && val === null) return undefined;
    if (typeof val !== "string") return val;
    return val.trim() || undefined;
  }, schema);

export const zodBuffer = z.custom<Buffer>((data) => Buffer.isBuffer(data) || data instanceof Uint8Array, {
  message: "Expected binary data (Buffer Or Uint8Array)"
});

export const re2Validator = (pattern: string | RegExp) => {
  const re2Pattern = new RE2(pattern);
  return (value: string) => re2Pattern.test(value);
};

// Zod 3 never applied a default wrapped in .optional(); use this where a shared defaulted schema is made optional.
const stripDefault = (field: z.ZodType): z.ZodType => {
  if (field instanceof z.ZodDefault) {
    const inner = field.unwrap() as z.ZodType;
    return field.description && !inner.description ? inner.describe(field.description) : inner;
  }
  if (field instanceof z.ZodPipe && !(field.in instanceof z.ZodTransform)) {
    const input = stripDefault(field.in as z.ZodType);
    if (input === field.in) return field;
    const rebuilt = field.clone({ ...field.def, in: input }) as z.ZodType;
    return field.description ? rebuilt.describe(field.description) : rebuilt;
  }
  return field;
};

export const withoutDefault = <T extends z.ZodType>(field: T) =>
  stripDefault(field) as unknown as z.ZodType<z.output<T>, z.input<T>>;

// Zod 4 applies .default() inside .optional()/.partial(), so a PATCH built with .partial() would reset
// every defaulted field the caller left out. This keeps omitted keys absent.
export const partialWithoutDefaults = <T extends z.ZodObject>(schema: T) => {
  const shape = Object.fromEntries(
    Object.entries(schema.shape as Record<string, z.ZodType>).map(([key, field]) => [
      key,
      withoutDefault(field).optional()
    ])
  );
  return schema.extend(shape) as unknown as ReturnType<T["partial"]>;
};
