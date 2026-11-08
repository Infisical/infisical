import { z } from "zod";

export enum ProvisioningTemplateKind {
  CloudFormationLaunch = "cloudformation-launch"
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

export const ProvisioningTemplateSchema = z.discriminatedUnion("kind", [CloudFormationLaunchSchema]);

export type TProvisioningTemplate = z.infer<typeof ProvisioningTemplateSchema>;

export type TProvisioningTemplateProvider<TQuery> = {
  getTemplate: (input: { externalId: string }, query: TQuery) => Promise<TProvisioningTemplate | null>;
};
