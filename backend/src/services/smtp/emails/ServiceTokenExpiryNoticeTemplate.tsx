import { Button, Heading, Section, Text } from "@react-email/components";
import React from "react";

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
      <Section className="px-[24px] mt-[36px] pt-[12px] pb-[8px] border border-solid border-gray-200 rounded-md bg-gray-50">
        <Text className="text-[14px]">
          Your service token <strong>{tokenName}</strong> for the project <strong>{projectName}</strong> will expire
          within 24 hours.
        </Text>
        <Text>If this token is still needed for your workflow, please create a new one before it expires.</Text>
      </Section>
      <Section className="text-center mt-[28px]">
        <Button
          href={url}
          className="rounded-md p-3 px-[28px] my-[8px] text-center text-[16px] bg-[#EBF852] border-solid border border-[#d1e309] text-black font-medium"
        >
          Create New Token
        </Button>
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
