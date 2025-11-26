import { Heading, Section, Text } from "@react-email/components";
import React from "react";

import { BaseButton } from "./BaseButton";
import { BaseEmailWrapper, BaseEmailWrapperProps } from "./BaseEmailWrapper";

interface ScimTokenExpiryNoticeTemplateProps extends Omit<BaseEmailWrapperProps, "title" | "preview" | "children"> {
  tokenDescription?: string;
  orgName: string;
  url: string;
}

export const ScimTokenExpiryNoticeTemplate = ({
  tokenDescription,
  siteUrl,
  orgName,
  url
}: ScimTokenExpiryNoticeTemplateProps) => {
  return (
    <BaseEmailWrapper title="SCIM Token Expiring Soon" preview="A SCIM token is about to expire." siteUrl={siteUrl}>
      <Heading className="text-black text-[18px] leading-[28px] text-center font-normal p-0 mx-0">
        <strong>SCIM token expiry notice</strong>
      </Heading>
      <Section className="px-[24px] mb-[28px] mt-[36px] pt-[12px] pb-[8px] border border-solid border-gray-200 rounded-md bg-gray-50">
        <Text className="text-[14px]">
          {tokenDescription ? (
            <>
              Your SCIM token <strong>{tokenDescription}</strong>
            </>
          ) : (
            "One of your SCIM tokens"
          )}{" "}
          for the organization <strong>{orgName}</strong> will expire within 24 hours.
        </Text>
        <Text>
          If this token is still needed for your external platform sync, please create a new one before it expires to
          avoid disruption to your workflow.
        </Text>
      </Section>
      <Section className="text-center">
        <BaseButton href={url}>Manage SCIM Tokens</BaseButton>
      </Section>
    </BaseEmailWrapper>
  );
};

export default ScimTokenExpiryNoticeTemplate;

ScimTokenExpiryNoticeTemplate.PreviewProps = {
  orgName: "Example Organization",
  siteUrl: "https://infisical.com",
  url: "https://infisical.com",
  tokenDescription: "Example SCIM Token"
} as ScimTokenExpiryNoticeTemplateProps;
