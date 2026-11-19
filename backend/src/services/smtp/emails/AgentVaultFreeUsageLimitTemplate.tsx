import { Heading, Section, Text } from "@react-email/components";
import React from "react";

import { BaseButton } from "./BaseButton";
import { BaseEmailWrapper, BaseEmailWrapperProps } from "./BaseEmailWrapper";

interface AgentVaultFreeUsageLimitTemplateProps extends Omit<BaseEmailWrapperProps, "title" | "preview" | "children"> {
  orgName: string;
  resetsAt: Date;
  url: string;
}

export const AgentVaultFreeUsageLimitTemplate = ({
  siteUrl,
  orgName,
  resetsAt,
  url
}: AgentVaultFreeUsageLimitTemplateProps) => {
  // The free month is a UTC calendar month, so the reset date is read in UTC too.
  const resetsOn = new Date(resetsAt).toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "UTC" });

  return (
    <BaseEmailWrapper
      title="Agent Vault Free Requests Used Up"
      preview="Your organization has used all of its free Agent Vault requests this month."
      siteUrl={siteUrl}
    >
      <Heading className="text-black text-[18px] leading-[28px] text-center font-normal p-0 mx-0">
        <strong>Agent Vault free requests used up</strong>
      </Heading>
      <Section className="px-[24px] mb-[28px] mt-[36px] pt-[12px] pb-[8px] border border-solid border-gray-200 rounded-md bg-gray-50">
        <Text className="text-[14px]">
          <strong>{orgName}</strong> has used all of its free Agent Vault requests this month.
        </Text>
        <Text>
          Your agents&apos; requests are paused until you add a payment method or the month resets on{" "}
          <strong>{resetsOn}</strong>.
        </Text>
      </Section>
      <Section className="text-center">
        <BaseButton href={url}>Add Payment Method</BaseButton>
      </Section>
    </BaseEmailWrapper>
  );
};

export default AgentVaultFreeUsageLimitTemplate;

AgentVaultFreeUsageLimitTemplate.PreviewProps = {
  orgName: "Example Organization",
  siteUrl: "https://infisical.com",
  url: "https://infisical.com",
  resetsAt: new Date("2026-12-01T00:00:00Z")
} as AgentVaultFreeUsageLimitTemplateProps;
