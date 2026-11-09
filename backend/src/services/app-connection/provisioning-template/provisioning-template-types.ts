import { z } from "zod";

export enum ProvisioningTemplateKind {
  CloudFormationLaunch = "cloudformation-launch",
  CloudFormationUpdate = "cloudformation-update"
}

export const CloudFormationLaunchSchema = z.object({
  kind: z.literal(ProvisioningTemplateKind.CloudFormationLaunch),
  launchUrl: z.string(),
  templateUrl: z.string(),
  stackName: z.string(),
  region: z.string(),
  partition: z.string(),
  templateVersion: z.string(),
  parameters: z.record(z.string()),
  outputKey: z.string()
});

export const CloudFormationUpdateSchema = z.object({
  kind: z.literal(ProvisioningTemplateKind.CloudFormationUpdate),
  stackUrl: z.string(),
  templateUrl: z.string(),
  stackName: z.string(),
  region: z.string(),
  partition: z.string(),
  templateVersion: z.string(),
  parameters: z.record(z.string()),
  companionParameters: z.array(z.string())
});

export const ProvisioningTemplateSchema = z.discriminatedUnion("kind", [
  CloudFormationLaunchSchema,
  CloudFormationUpdateSchema
]);

export type TProvisioningTemplate = z.infer<typeof ProvisioningTemplateSchema>;

export type TProvisioningTemplateProvider<TQuery, TUpdateQuery> = {
  getTemplate: (input: { externalId: string }, query: TQuery) => Promise<TProvisioningTemplate | null>;
  getUpdateTemplate: (
    input: { configuration: unknown; method: string },
    query: TUpdateQuery
  ) => Promise<TProvisioningTemplate | null>;
};
