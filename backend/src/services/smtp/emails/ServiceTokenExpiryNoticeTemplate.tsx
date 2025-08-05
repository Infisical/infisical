import { Heading, Section, Text } from "@react-email/components";
import React from "react";

import { BaseButton } from "./BaseButton";
import { BaseEmailWrapper, BaseEmailWrapperProps } from "./BaseEmailWrapper";

interface ServiceTokenExpiryNoticeTemplateProps extends Omit<BaseEmailWrapperProps, "title" | "preview" | "children"> {
  tokenName: string;
  projectName: string;
  url: string;
}

export const ServiceTokenExpiryNoticeTemplate = ({
  tokenName,
  siteUrl,
  projectName,
  url
}: ServiceTokenExpiryNoticeTemplateProps) => {
  return (
    <BaseEmailWrapper
      title="Service Token Expiring Soon"
      preview="A service token is about to expire."
      siteUrl={siteUrl}
    >
      <Heading className="text-black text-[18px] leading-[28px] text-center font-normal p-0 mx-0">
        <strong>Service token expiry notice</strong>
      </Heading>
      <Section className="px-[24px] mb-[28px] mt-[36px] pt-[12px] pb-[8px] border border-solid border-gray-200 rounded-md bg-gray-50">
        <Text className="text-[14px]">
          Your service token <strong>{tokenName}</strong> for the project <strong>{projectName}</strong> will expire
          within 24 hours.
        </Text>
        <Text>If this token is still needed for your workflow, please create a new one before it expires.</Text>
      </Section>
      <Section className="text-center">
        <BaseButton href={url}>Create New Token</BaseButton>
      </Section>
    </BaseEmailWrapper>
  );
};

export default ServiceTokenExpiryNoticeTemplate;

ServiceTokenExpiryNoticeTemplate.PreviewProps = {
  projectName: "Example Project",
  siteUrl: "https://infisical.com",
  url: "https://infisical.com",
  tokenName: "Example Token"
} as ServiceTokenExpiryNoticeTemplateProps;
