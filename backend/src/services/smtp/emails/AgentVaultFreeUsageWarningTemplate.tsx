import { Heading, Section, Text } from "@react-email/components";
import React from "react";

import { BaseButton } from "./BaseButton";
import { BaseEmailWrapper, BaseEmailWrapperProps } from "./BaseEmailWrapper";

interface AgentVaultFreeUsageWarningTemplateProps extends Omit<
  BaseEmailWrapperProps,
  "title" | "preview" | "children"
> {
  orgName: string;
  percent: number;
  url: string;
}

export const AgentVaultFreeUsageWarningTemplate = ({
  siteUrl,
  orgName,
  percent,
  url
}: AgentVaultFreeUsageWarningTemplateProps) => {
  return (
    <BaseEmailWrapper
      title="Agent Vault Free Requests Running Low"
      preview="Your organization has used most of its free Agent Vault requests this month."
      siteUrl={siteUrl}
    >
      <Heading className="text-black text-[18px] leading-[28px] text-center font-normal p-0 mx-0">
        <strong>Agent Vault free requests running low</strong>
      </Heading>
      <Section className="px-[24px] mb-[28px] mt-[36px] pt-[12px] pb-[8px] border border-solid border-gray-200 rounded-md bg-gray-50">
        <Text className="text-[14px]">
          <strong>{orgName}</strong> has used {percent}% of its free Agent Vault requests this month.
        </Text>
        <Text>Add a payment method to keep your agents running without disruption.</Text>
      </Section>
      <Section className="text-center">
        <BaseButton href={url}>Add Payment Method</BaseButton>
      </Section>
    </BaseEmailWrapper>
  );
};

export default AgentVaultFreeUsageWarningTemplate;

AgentVaultFreeUsageWarningTemplate.PreviewProps = {
  orgName: "Example Organization",
  percent: 75,
  siteUrl: "https://infisical.com",
  url: "https://infisical.com"
} as AgentVaultFreeUsageWarningTemplateProps;
