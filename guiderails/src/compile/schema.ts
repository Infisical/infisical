import * as z from "zod/v4";

/**
 * The compiler's output schema, enforced by the API rather than by post-hoc parsing.
 *
 * `sourceQuote` is required on every action and is the load-bearing field. It anchors each
 * action to the exact bytes it came from, which is what makes a later finding citable
 * instead of merely plausible, and it is what lets the reporter place a GitHub suggestion on
 * the correct line. A compile that cannot produce a quote for an action has hallucinated
 * that action, so the validator rejects it rather than letting it through.
 */

export const sourceQuoteSchema = z.object({
  text: z
    .string()
    .min(1)
    .describe(
      "The exact substring of the guide this action came from, copied verbatim. Must appear " +
        "character-for-character in the step text you were given."
    ),
  line: z
    .number()
    .int()
    .describe("The line number in the source file where that text appears.")
});

const navigateAction = z.object({
  kind: z.literal("navigate"),
  path: z
    .array(z.string().min(1))
    .min(1)
    .describe("Breadcrumb segments, outermost first, e.g. ['Project', 'Integrations']."),
  sourceQuote: sourceQuoteSchema
});

const clickAction = z.object({
  kind: z.literal("click"),
  target: z
    .string()
    .min(1)
    .describe("The visible label of the control, exactly as a user would read it."),
  role: z
    .string()
    .nullable()
    .describe(
      "ARIA role if the guide makes it unambiguous (button, link, tab, checkbox), else null. " +
        "Do not guess: a wrong role makes the locator strictly worse than none."
    ),
  sourceQuote: sourceQuoteSchema
});

const fillAction = z.object({
  kind: z.literal("fill"),
  field: z.string().min(1).describe("The field's visible label."),
  value: z
    .string()
    .describe(
      "The value to type. Use a {{fixture.key}} placeholder for anything that must come " +
        "from the environment rather than being invented."
    ),
  sourceQuote: sourceQuoteSchema
});

const selectAction = z.object({
  kind: z.literal("select"),
  field: z.string().min(1).describe("The dropdown's visible label."),
  option: z.string().min(1).describe("The option to choose."),
  sourceQuote: sourceQuoteSchema
});

const expectVisibleAction = z.object({
  kind: z.literal("expect_visible"),
  text: z.string().min(1).describe("Text that must be present once the step has succeeded."),
  sourceQuote: sourceQuoteSchema
});

const expectScreenshotAction = z.object({
  kind: z.literal("expect_screenshot"),
  docImage: z
    .string()
    .min(1)
    .describe("The image reference from the guide, exactly as written in the MDX."),
  sourceQuote: sourceQuoteSchema
});

const externalAction = z.object({
  kind: z.literal("external"),
  reason: z
    .string()
    .min(1)
    .describe(
      "Why this step cannot be verified against a local instance: a third-party console, a " +
        "cloud provider account, an email inbox, a CLI install."
    ),
  sourceQuote: sourceQuoteSchema
});

export const actionSchema = z.discriminatedUnion("kind", [
  navigateAction,
  clickAction,
  fillAction,
  selectAction,
  expectVisibleAction,
  expectScreenshotAction,
  externalAction
]);

export const planStepSchema = z.object({
  docStepIndex: z
    .number()
    .int()
    .describe("The 1-based step number from the guide, so results map back to the source."),
  instruction: z
    .string()
    .min(1)
    .describe("One sentence naming what the reader is trying to accomplish in this step."),
  actions: z
    .array(actionSchema)
    .describe(
      "The ordered actions this step requires. Empty only when the step is purely " +
        "informational and asks the reader to do nothing."
    )
});

export const compiledProcedureSchema = z.object({
  steps: z.array(planStepSchema)
});

export type CompiledProcedure = z.infer<typeof compiledProcedureSchema>;
export type CompiledAction = z.infer<typeof actionSchema>;
