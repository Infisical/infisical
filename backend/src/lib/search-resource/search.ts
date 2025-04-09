import { z } from "zod";

export enum SearchResourceOperators {
  $eq = "$eq",
  $neq = "$neq",
  $in = "$in",
  $contains = "$contains"
}

export const SearchResourceOperatorSchema = z.union([
  z.string(),
  z.number(),
  z
    .object({
      [SearchResourceOperators.$eq]: z.string().optional(),
      [SearchResourceOperators.$neq]: z.string().optional(),
      [SearchResourceOperators.$in]: z.string().array().optional(),
      [SearchResourceOperators.$contains]: z.string().array().optional()
    })
    .partial()
]);

export type TSearchResourceOperator = z.infer<typeof SearchResourceOperatorSchema>;

export type TSearchResource = {
  [k: string]: z.ZodOptional<
    z.ZodUnion<
      [
        z.ZodEffects<z.ZodString | z.ZodNumber>,
        z.ZodObject<{
          [SearchResourceOperators.$eq]?: z.ZodOptional<z.ZodEffects<z.ZodString | z.ZodNumber>>;
          [SearchResourceOperators.$neq]?: z.ZodOptional<z.ZodEffects<z.ZodString | z.ZodNumber>>;
          [SearchResourceOperators.$in]?: z.ZodOptional<z.ZodArray<z.ZodEffects<z.ZodString | z.ZodNumber>>>;
          [SearchResourceOperators.$contains]?: z.ZodOptional<z.ZodEffects<z.ZodString>>;
        }>
      ]
    >
  >;
};

export const buildSearchZodSchema = <T extends TSearchResource>(schema: z.ZodObject<T>) => {
  return schema.extend({ $or: schema.array().max(5).optional() }).optional();
};
