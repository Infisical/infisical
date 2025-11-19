import { Heading, Section, Text } from "@react-email/components";
import React from "react";

import { BaseEmailWrapper, BaseEmailWrapperProps } from "./BaseEmailWrapper";
import { BaseLink } from "./BaseLink";

interface OrgAdminBreakglassAccessTemplateProps extends Omit<BaseEmailWrapperProps, "title" | "preview" | "children"> {
  email: string;
  timestamp: string;
  orgId: string;
  ip: string;
  userAgent: string;
}

export const OrgAdminBreakglassAccessTemplate = ({
  email,
  siteUrl,
  timestamp,
  orgId,
  ip,
  userAgent
}: OrgAdminBreakglassAccessTemplateProps) => {
  return (
    <BaseEmailWrapper
      title="Organization Admin has Bypassed SSO"
      preview="An organization admin has bypassed SSO."
      siteUrl={siteUrl}
    >
      <Heading className="text-black text-[18px] leading-[28px] text-center font-normal p-0 mx-0">
        The organization admin <strong>{email}</strong> has bypassed enforced SSO login
      </Heading>
      <Section className="px-[24px] mt-[36px] pt-[24px] pb-[8px] border border-solid border-gray-200 rounded-md bg-gray-50">
        <strong className="text-[14px]">Timestamp</strong>
        <Text className="text-[14px] mt-[4px]">{timestamp}</Text>
        <strong className="text-[14px]">IP Address</strong>
        <Text className="text-[14px] mt-[4px]">{ip}</Text>
        <strong className="text-[14px]">User Agent</strong>
        <Text className="text-[14px] mt-[4px]">{userAgent}</Text>
        <Text className="text-[14px]">
          If you'd like to disable Admin SSO Bypass, please visit{" "}
          <BaseLink href={`${siteUrl}/organizations/${orgId}/settings`}>Organization Security Settings</BaseLink>.
        </Text>
      </Section>
    </BaseEmailWrapper>
  );
};

export default OrgAdminBreakglassAccessTemplate;

OrgAdminBreakglassAccessTemplate.PreviewProps = {
  ip: "127.0.0.1",
  userAgent:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.3.1 Safari/605.1.15",
  timestamp: "Tue Apr 29 2025 23:03:27 GMT+0000 (Coordinated Universal Time)",
  siteUrl: "https://infisical.com",
  email: "august@infisical.com",
  orgId: "123"
} as OrgAdminBreakglassAccessTemplateProps;
