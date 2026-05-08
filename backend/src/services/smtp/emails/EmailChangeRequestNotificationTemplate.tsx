import { Heading, Section, Text } from "@react-email/components";
import React from "react";

import { BaseEmailWrapper, BaseEmailWrapperProps } from "./BaseEmailWrapper";
import { BaseLink } from "./BaseLink";

interface EmailChangeRequestNotificationTemplateProps
  extends Omit<BaseEmailWrapperProps, "title" | "preview" | "children"> {
  currentEmail: string;
  requestedEmail: string;
  code: string;
  isCloud: boolean;
}

export const EmailChangeRequestNotificationTemplate = ({
  currentEmail,
  requestedEmail,
  code,
  siteUrl,
  isCloud
}: EmailChangeRequestNotificationTemplateProps) => {
  return (
    <BaseEmailWrapper
      title="Confirm your Infisical email change"
      preview="Confirm the email change requested on your Infisical account."
      siteUrl={siteUrl}
    >
      <Heading className="text-black text-[18px] leading-[28px] text-center font-normal p-0 mx-0">
        <strong>Confirm your email change</strong>
      </Heading>
      <Section className="px-[24px] mt-[36px] pt-[12px] pb-[8px] text-[14px] border border-solid border-gray-200 rounded-md bg-gray-50">
        <Text className="text-[14px]">A request was made to change the email on your Infisical account.</Text>
        <strong>Current email</strong>
        <Text className="text-[14px] mt-[4px]">{currentEmail}</Text>
        <strong>Requested new email</strong>
        <Text className="text-[14px] mt-[4px]">{requestedEmail}</Text>
        <Text className="text-[14px]">
          Enter the confirmation code below to approve this change. After confirming, a separate code will be sent to
          the new email address to finalize the change.
        </Text>
        <Text className="text-[24px] text-center mt-[16px]">
          <strong>{code}</strong>
        </Text>
      </Section>
      <Section className="mt-[24px] bg-gray-50 px-[24px] pt-[2px] pb-[16px] border border-solid border-gray-200 rounded-md text-gray-800">
        <Text className="mb-[0px]">
          <strong>If this wasn&apos;t you</strong>, do not enter the code and contact{" "}
          {isCloud ? (
            <BaseLink href="mailto:support@infisical.com">support@infisical.com</BaseLink>
          ) : (
            "your administrator"
          )}{" "}
          immediately. Without this code, the email cannot be changed.
        </Text>
      </Section>
    </BaseEmailWrapper>
  );
};

export default EmailChangeRequestNotificationTemplate;

EmailChangeRequestNotificationTemplate.PreviewProps = {
  currentEmail: "old@infisical.com",
  requestedEmail: "new@infisical.com",
  code: "124356",
  isCloud: true,
  siteUrl: "https://infisical.com"
} as EmailChangeRequestNotificationTemplateProps;
