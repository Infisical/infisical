import { Heading, Section, Text } from "@react-email/components";
import React from "react";

import { BaseEmailWrapper, BaseEmailWrapperProps } from "./BaseEmailWrapper";
import { BaseLink } from "./BaseLink";

interface EmailChangeExistingAccountTemplateProps
  extends Omit<BaseEmailWrapperProps, "title" | "preview" | "children"> {
  email: string;
  isCloud: boolean;
}

export const EmailChangeExistingAccountTemplate = ({
  email,
  siteUrl,
  isCloud
}: EmailChangeExistingAccountTemplateProps) => {
  return (
    <BaseEmailWrapper
      title="Email Change Request Received"
      preview="An email change was requested for an address that already has an Infisical account."
      siteUrl={siteUrl}
    >
      <Heading className="text-black text-[18px] leading-[28px] text-center font-normal p-0 mx-0">
        <strong>Email Change Request Received</strong>
      </Heading>
      <Section className="px-[24px] mt-[36px] pt-[12px] pb-[8px] text-[14px] border border-solid border-gray-200 rounded-md bg-gray-50">
        <Text className="text-[14px]">
          A request was made to change the email address of an Infisical account to <strong>{email}</strong>.
        </Text>
        <Text className="text-[14px]">
          Because this address already belongs to an existing Infisical account, the change was not completed. No
          verification code was sent and no accounts have been modified.
        </Text>
        <Text className="text-[14px]">
          If this was you trying to move another of your accounts to this address, first delete the account that
          currently uses this address from Personal Settings (or pick a different address), then request the email
          change again.
        </Text>
      </Section>
      <Section className="px-[24px] mb-[28px] mt-[28px] pt-[12px] pb-[8px] border border-solid border-gray-200 rounded-md bg-gray-50">
        <Text className="text-[14px]">
          If you did not request this, you can safely ignore this message. Your account is unaffected.
        </Text>
      </Section>
      <Section className="mt-[24px] bg-gray-50 pt-[2px] pb-[16px] border border-solid border-gray-200 px-[24px] rounded-md text-gray-800">
        <Text className="mb-[0px]">
          <strong>Need help?</strong>{" "}
          {isCloud ? (
            <>
              Contact us at <BaseLink href="mailto:support@infisical.com">support@infisical.com</BaseLink>
            </>
          ) : (
            "Contact your administrator"
          )}
          .
        </Text>
      </Section>
    </BaseEmailWrapper>
  );
};

export default EmailChangeExistingAccountTemplate;

EmailChangeExistingAccountTemplate.PreviewProps = {
  email: "user@example.com",
  isCloud: true,
  siteUrl: "https://infisical.com"
} as EmailChangeExistingAccountTemplateProps;
