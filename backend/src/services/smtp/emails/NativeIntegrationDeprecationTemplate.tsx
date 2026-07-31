import { Heading, Section, Text } from "@react-email/components";

import { NATIVE_INTEGRATION_DEPRECATION_DATE } from "@app/services/integration/integration-deprecation-fns";

import { BaseButton } from "./BaseButton";
import { BaseEmailWrapper, BaseEmailWrapperProps } from "./BaseEmailWrapper";
import { BaseLink } from "./BaseLink";

interface NativeIntegrationDeprecationTemplateProps
  extends Omit<BaseEmailWrapperProps, "title" | "preview" | "children"> {
  orgName: string;
  // a single entry for the per-project email, every affected project for the org-wide email
  projects: { name: string; integrations: string[]; url: string }[];
}

export const NativeIntegrationDeprecationTemplate = ({
  siteUrl,
  orgName,
  projects
}: NativeIntegrationDeprecationTemplateProps) => {
  const deprecationDate = NATIVE_INTEGRATION_DEPRECATION_DATE;
  const isSingleProject = projects.length === 1;

  return (
    <BaseEmailWrapper
      title="Native Integrations are moving to Secret Syncs"
      preview={`Recreate your native integrations as Secret Syncs before ${deprecationDate}.`}
      siteUrl={siteUrl}
    >
      <Heading className="text-black text-[18px] leading-[28px] text-center font-normal p-0 mx-0">
        <strong>Native Integrations Stop Working on {deprecationDate}</strong>
      </Heading>
      <Section className="px-[24px] mb-[28px] mt-[36px] pt-[12px] pb-[8px] border border-solid border-gray-200 rounded-md bg-gray-50">
        <Text className="text-black text-[14px] leading-[24px]">
          {isSingleProject ? (
            <>
              The <strong>{projects[0].name}</strong> project in <strong>{orgName}</strong> still uses native
              integrations.
            </>
          ) : (
            <>
              <strong>{projects.length}</strong> projects in <strong>{orgName}</strong> still use native integrations.
            </>
          )}{" "}
          They stop working on <strong>{deprecationDate}</strong>. After that date these integrations stop syncing
          secrets. Recreate each one as a Secret Sync before then. Secret Syncs cover the same third-party services.
        </Text>
      </Section>
      <Section className="mb-[28px]">
        <Text className="text-[14px] font-semibold mb-[12px]">
          {isSingleProject ? "Integrations to migrate" : "Projects using native integrations"}
        </Text>
        <div style={{ maxHeight: "280px", overflowY: "auto" }}>
          {projects.map((project) => (
            <Section
              key={project.name}
              className="mb-[16px] p-[16px] border border-solid border-gray-200 rounded-md bg-gray-50"
            >
              <Text className="text-[14px] font-semibold m-0 mb-[4px]">
                <BaseLink href={project.url}>{project.name}</BaseLink>
              </Text>
              <Text className="text-[12px] text-gray-600 m-0">{project.integrations.join(", ")}</Text>
            </Section>
          ))}
        </div>
      </Section>
      <Section className="text-center">
        <BaseButton href="https://infisical.com/docs/integrations/secret-syncs/overview">
          Migrate to Secret Syncs
        </BaseButton>
      </Section>
    </BaseEmailWrapper>
  );
};

export default NativeIntegrationDeprecationTemplate;

NativeIntegrationDeprecationTemplate.PreviewProps = {
  siteUrl: "https://infisical.com",
  orgName: "Example Organization",
  projects: [
    {
      name: "backend-api",
      integrations: ["GitHub", "AWS Parameter Store", "Vercel"],
      url: "https://infisical.com"
    },
    {
      name: "web-app",
      integrations: ["Netlify", "Cloudflare Pages"],
      url: "https://infisical.com"
    },
    {
      name: "mobile-app",
      integrations: ["Firebase", "AWS Secrets Manager"],
      url: "https://infisical.com"
    },
    {
      name: "data-pipeline",
      integrations: ["Databricks", "Snowflake"],
      url: "https://infisical.com"
    },
    {
      name: "infra",
      integrations: ["Terraform Cloud", "Fly.io"],
      url: "https://infisical.com"
    }
  ]
} as NativeIntegrationDeprecationTemplateProps;
