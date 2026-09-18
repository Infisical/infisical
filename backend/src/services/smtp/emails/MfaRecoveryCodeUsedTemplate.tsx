import { Heading, Section, Text } from "@react-email/components";
import React from "react";

import { BaseEmailWrapper, BaseEmailWrapperProps } from "./BaseEmailWrapper";
import { BaseLink } from "./BaseLink";

interface MfaRecoveryCodeUsedTemplateProps extends Omit<BaseEmailWrapperProps, "title" | "preview" | "children"> {
  email: string;
  timestamp: string;
  ip: string;
  userAgent: string;
  isCloud: boolean;
}

export const MfaRecoveryCodeUsedTemplate = ({
  email,
  timestamp,
  ip,
  userAgent,
  siteUrl,
  isCloud
}: MfaRecoveryCodeUsedTemplateProps) => {
  return (
    <BaseEmailWrapper
      title="Recovery Code Used to Sign In"
      preview="A recovery code was used to sign in to your Infisical account."
      siteUrl={siteUrl}
    >
      <Heading className="text-black text-[18px] leading-[28px] text-center font-normal p-0 mx-0">
        A recovery code was used to sign in to
        <br />
        <strong>{email}</strong>
      </Heading>
      <Section className="px-[24px] mt-[36px] pt-[26px] pb-[4px] text-[14px] border border-solid border-gray-200 rounded-md bg-gray-50">
        <strong>Timestamp</strong>
        <Text className="text-[14px] mt-[4px]">{timestamp}</Text>
        <strong>IP Address</strong>
        <Text className="text-[14px] mt-[4px]">{ip}</Text>
        <strong>User Agent</strong>
        <Text className="text-[14px] mt-[4px]">{userAgent}</Text>
      </Section>
      <Section className="mt-[24px] bg-gray-50 px-[24px] pt-[2px] pb-[16px] border border-solid border-gray-200 rounded-md text-gray-800">
        <Text className="mb-[0px]">
          If this was you, no action is needed. If you did not sign in, your account may be compromised: reset your
          password, rotate your recovery codes and contact{" "}
          {isCloud ? (
            <BaseLink href="mailto:support@infisical.com">support@infisical.com</BaseLink>
          ) : (
            "your administrator"
          )}
          {" "}immediately.
        </Text>
      </Section>
    </BaseEmailWrapper>
  );
};

export default MfaRecoveryCodeUsedTemplate;

MfaRecoveryCodeUsedTemplate.PreviewProps = {
  email: "john@infisical.com",
  ip: "127.0.0.1",
  userAgent:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.3.1 Safari/605.1.15",
  timestamp: "Tue Apr 29 2025 23:03:27 GMT+0000 (Coordinated Universal Time)",
  isCloud: true,
  siteUrl: "https://infisical.com"
} as MfaRecoveryCodeUsedTemplateProps;
