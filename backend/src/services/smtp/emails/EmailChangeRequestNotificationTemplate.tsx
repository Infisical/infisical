import { Heading, Section, Text } from "@react-email/components";
import React from "react";

import { BaseEmailWrapper, BaseEmailWrapperProps } from "./BaseEmailWrapper";
import { BaseLink } from "./BaseLink";

interface EmailChangeRequestNotificationTemplateProps
  extends Omit<BaseEmailWrapperProps, "title" | "preview" | "children"> {
  currentEmail: string;
  requestedEmail: string;
  isCloud: boolean;
}

export const EmailChangeRequestNotificationTemplate = ({
  currentEmail,
  requestedEmail,
  siteUrl,
  isCloud
}: EmailChangeRequestNotificationTemplateProps) => {
  return (
    <BaseEmailWrapper
      title="Email change requested on your Infisical account"
      preview="Security alert: someone requested to change your account email."
      siteUrl={siteUrl}
    >
      <Heading className="text-black text-[18px] leading-[28px] text-center font-normal p-0 mx-0">
        <strong>Email change requested</strong>
      </Heading>
      <Section className="px-[24px] mt-[36px] pt-[12px] pb-[8px] text-[14px] border border-solid border-gray-200 rounded-md bg-gray-50">
        <Text className="text-[14px]">Someone requested to change the email on your Infisical account.</Text>
        <strong>Current email</strong>
        <Text className="text-[14px] mt-[4px]">{currentEmail}</Text>
        <strong>Requested new email</strong>
        <Text className="text-[14px] mt-[4px]">{requestedEmail}</Text>
        <Text className="text-[14px]">
          A verification code was sent to the new address. If the code is entered, your account email will be changed
          and all sessions will be signed out.
        </Text>
      </Section>
      <Section className="mt-[24px] bg-gray-50 px-[24px] pt-[2px] pb-[16px] border border-solid border-gray-200 rounded-md text-gray-800">
        <Text className="mb-[0px]">
          <strong>If this wasn&apos;t you</strong>, change your password immediately and contact{" "}
          {isCloud ? (
            <BaseLink href="mailto:support@infisical.com">support@infisical.com</BaseLink>
          ) : (
            "your administrator"
          )}
          . You can safely ignore this email if you requested the change yourself.
        </Text>
      </Section>
    </BaseEmailWrapper>
  );
};

export default EmailChangeRequestNotificationTemplate;

EmailChangeRequestNotificationTemplate.PreviewProps = {
  currentEmail: "old@infisical.com",
  requestedEmail: "new@infisical.com",
  isCloud: true,
  siteUrl: "https://infisical.com"
} as EmailChangeRequestNotificationTemplateProps;
