import { Heading, Section, Text } from "@react-email/components";
import React from "react";

import { BaseButton } from "./BaseButton";
import { BaseEmailWrapper, BaseEmailWrapperProps } from "./BaseEmailWrapper";

interface IntegrationSyncFailedTemplateProps extends Omit<BaseEmailWrapperProps, "title" | "preview" | "children"> {
  count: number;
  projectName: string;
  secretPath: string;
  environment: string;
  syncMessage: string;
  integrationUrl: string;
}

export const IntegrationSyncFailedTemplate = ({
  count,
  siteUrl,
  projectName,
  secretPath,
  environment,
  syncMessage,
  integrationUrl
}: IntegrationSyncFailedTemplateProps) => {
  return (
    <BaseEmailWrapper
      title="Integration Sync Failed"
      preview="An integration sync error has occurred."
      siteUrl={siteUrl}
    >
      <Heading className="text-black text-[18px] leading-[28px] text-center font-normal p-0 mx-0">
        <strong>{count}</strong> integration(s) failed to sync
      </Heading>
      <Section className="px-[24px] mb-[28px] mt-[36px] pt-[26px] pb-[4px] text-[14px] border border-solid border-gray-200 rounded-md bg-gray-50">
        <strong>Project</strong>
        <Text className="text-[14px] mt-[4px]">{projectName}</Text>
        <strong>Environment</strong>
        <Text className="text-[14px] mt-[4px]">{environment}</Text>
        <strong>Secret Path</strong>
        <Text className="text-[14px] mt-[4px]">{secretPath}</Text>
        <strong className="text-black">Failure Reason:</strong>
        <Text className="text-[14px] mt-[4px] text-red-600 leading-[24px]">"{syncMessage}"</Text>
      </Section>
      <Section className="text-center">
        <BaseButton href={integrationUrl}>View Integrations</BaseButton>
      </Section>
    </BaseEmailWrapper>
  );
};

export default IntegrationSyncFailedTemplate;

IntegrationSyncFailedTemplate.PreviewProps = {
  projectName: "Example Project",
  secretPath: "/api/secrets",
  environment: "Production",
  siteUrl: "https://infisical.com",
  integrationUrl: "https://infisical.com",
  count: 2,
  syncMessage: "Secret key cannot contain a colon (:)"
} as IntegrationSyncFailedTemplateProps;
