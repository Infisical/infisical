import * as z from "zod/v4";

import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

import { addUsage, cachedSystem, getClient, modelFor, type UsageTotals } from "../llm.js";
import type { Blame, Finding } from "../types.js";

/**
 * L5: the judge. Two jobs, both structured-output, both requiring cited evidence.
 *
 *  1. Screenshot comparison: does the committed screenshot still depict this screen.
 *  2. Blame: is the guide stale, or did the app regress, or is this the harness's own fault.
 *
 * Blame is the reason this layer exists at all. A check that only says "these disagree" pushes
 * the diagnosis onto the reader; one that says which side is wrong is actionable, and it is what
 * separates a docs suggestion from a bug report. Effort is set higher here than anywhere else
 * for the same reason: this is the judgement the whole report rests on.
 */

const SCREENSHOT_SYSTEM_PROMPT = `You compare a screenshot from documentation against a screenshot of the live application, and decide whether the documented image still depicts the current screen.

You are checking whether a reader would recognise the screen from the documentation image. You are not checking whether the two images are identical, and you are not reviewing the design.

## Ignore completely

Data and environment differ by design and are never a finding:

- Secret names, values, project names, organisation names, slugs, IDs, URLs
- Timestamps, relative dates, counts, row counts, pagination
- Avatars, initials, user names, email addresses
- Window width, zoom, scrollbars, font rendering, colour theme, light or dark mode
- Which rows happen to be present in a table
- Cropping: the documentation image is often a tight crop of a larger page

## Report only

Differences a reader would trip over:

- A control's label has changed ("Confirm" became "Accept")
- A field or column label has changed
- A tab or section name has changed
- A control the documentation shows is absent from the live screen
- A control the live screen requires is absent from the documentation
- The documentation image shows a completely different screen

## Verdicts

- match: a reader would recognise this screen and every label they need is where the documentation says.
- stale: the same screen, but at least one label or control has changed.
- wrong_screen: the documentation image depicts a different part of the product.

Every label you report must be text you can actually read in the image. If you cannot read a label clearly, do not report it.`;

const screenshotVerdictSchema = z.object({
  verdict: z.enum(["match", "stale", "wrong_screen"]),
  sameScreen: z.boolean().describe("Whether both images depict the same part of the product."),
  labelDiffs: z
    .array(
      z.object({
        docText: z.string().describe("The label as it reads in the documentation image."),
        liveText: z.string().describe("The corresponding label in the live image.")
      })
    )
    .describe("Label changes only. Empty when nothing textual changed."),
  missingInLive: z
    .array(z.string())
    .describe("Controls shown in the documentation image that are absent live."),
  newInLive: z
    .array(z.string())
    .describe("Controls the live screen requires that the documentation image lacks."),
  confidence: z
    .enum(["high", "medium", "low"])
    .describe("Low when either image is unclear, cropped awkwardly, or mid-load.")
});

export type ScreenshotVerdict = z.infer<typeof screenshotVerdictSchema>;

const MEDIA_TYPES: Record<string, "image/png" | "image/jpeg" | "image/webp"> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp"
};

export const mediaTypeFor = (filePath: string): "image/png" | "image/jpeg" | "image/webp" => {
  const extension = filePath.slice(filePath.lastIndexOf(".")).toLowerCase();
  return MEDIA_TYPES[extension] ?? "image/png";
};

export const compareScreenshots = async (
  params: {
    docImageBase64: string;
    docMediaType: "image/png" | "image/jpeg" | "image/webp";
    liveImageBase64: string;
    stepInstruction: string;
  },
  usage: UsageTotals
): Promise<ScreenshotVerdict | null> => {
  const client = getClient();

  const response = await client.messages.parse({
    model: modelFor("screenshot"),
    max_tokens: 4000,
    system: cachedSystem(SCREENSHOT_SYSTEM_PROMPT),
    thinking: { type: "adaptive" },
    output_config: { effort: "medium", format: zodOutputFormat(screenshotVerdictSchema) },
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: `Step under test: ${params.stepInstruction}` },
          { type: "text", text: "Documentation screenshot:" },
          {
            type: "image",
            source: {
              type: "base64",
              media_type: params.docMediaType,
              data: params.docImageBase64
            }
          },
          { type: "text", text: "Live application screenshot:" },
          {
            type: "image",
            source: { type: "base64", media_type: "image/png", data: params.liveImageBase64 }
          }
        ]
      }
    ]
  });

  addUsage(usage, response.usage);
  return response.parsed_output ?? null;
};

// ---------------------------------------------------------------------------
// Blame
// ---------------------------------------------------------------------------

const BLAME_SYSTEM_PROMPT = `You decide which side of a documentation mismatch is wrong.

You are given a discrepancy between what a guide says and what the running application does, plus the list of files changed in the pull request under test.

## The three answers

- DOC_DRIFT: the application is correct and the guide is out of date. The usual case when the PR changed application code and the guide still describes the old behaviour. The fix is a documentation edit.

- APP_REGRESSION: the guide is correct and the application is broken. Choose this when the guide describes long-standing intended behaviour and the change looks unintentional: a control that has disappeared entirely, a flow that cannot be completed, a label that changed in a way no one would choose deliberately. This is a bug report, not a documentation nit.

- HARNESS: neither. The harness could not reach the state the step assumed, hit a timing or fixture problem, or needed a control with no accessible name. Anything you are unsure about belongs here.

## How to weigh it

The changed-files list is the strongest signal available. A mismatch about a button label in a PR that edited that button's component is DOC_DRIFT. The same mismatch in a PR that touched nothing related is more likely APP_REGRESSION or HARNESS.

Prefer HARNESS when uncertain. A wrong DOC_DRIFT posts a bad suggestion onto someone's pull request, and a wrong APP_REGRESSION sends them hunting a bug that does not exist. An over-cautious HARNESS costs nothing but a line in a report.`;

const blameVerdictSchema = z.object({
  blame: z.enum(["DOC_DRIFT", "APP_REGRESSION", "HARNESS"]),
  reasoning: z.string().min(1).describe("One or two sentences justifying the choice."),
  suggestedDocText: z
    .string()
    .nullable()
    .describe(
      "For DOC_DRIFT only, and only for a label or wording change: the corrected text to " +
        "substitute for what the guide currently says. Null for anything that needs a human " +
        "to rewrite, and null for the other two verdicts."
    ),
  confidence: z.enum(["high", "medium", "low"])
});

export type BlameVerdict = z.infer<typeof blameVerdictSchema>;

export const classifyBlame = async (
  params: {
    finding: Pick<Finding, "severity" | "summary" | "docSays" | "appShows">;
    guide: string;
    changedFiles: string[];
  },
  usage: UsageTotals
): Promise<BlameVerdict> => {
  const client = getClient();

  const changed =
    params.changedFiles.length > 0
      ? params.changedFiles.slice(0, 60).join("\n")
      : "(not a pull-request run; no changed-file list available)";

  const response = await client.messages.parse({
    model: modelFor("blame"),
    max_tokens: 3000,
    system: cachedSystem(BLAME_SYSTEM_PROMPT),
    thinking: { type: "adaptive" },
    // The judgement the whole report rests on, so this is the one place worth paying more.
    output_config: { effort: "high", format: zodOutputFormat(blameVerdictSchema) },
    messages: [
      {
        role: "user",
        content: [
          `Guide: ${params.guide}`,
          `Severity: ${params.finding.severity}`,
          `Discrepancy: ${params.finding.summary}`,
          `The guide says: ${params.finding.docSays}`,
          `The application shows: ${params.finding.appShows}`,
          "",
          "Files changed in this pull request:",
          changed
        ].join("\n")
      }
    ]
  });

  addUsage(usage, response.usage);

  return (
    response.parsed_output ?? {
      blame: "HARNESS" as Blame,
      reasoning: "The classifier returned no parseable verdict, so this defaults to HARNESS.",
      suggestedDocText: null,
      confidence: "low" as const
    }
  );
};

export { SCREENSHOT_SYSTEM_PROMPT, BLAME_SYSTEM_PROMPT };
