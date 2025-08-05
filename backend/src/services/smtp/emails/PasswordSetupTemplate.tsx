import { Button, Heading, Section, Text } from "@react-email/components";
import React from "react";

import { BaseLink } from "@app/services/smtp/emails/BaseLink";

import { BaseEmailWrapper, BaseEmailWrapperProps } from "./BaseEmailWrapper";

interface PasswordSetupTemplateProps extends Omit<BaseEmailWrapperProps, "title" | "preview" | "children"> {
  email: string;
  callback_url: string;
  token: string;
  isCloud: boolean;
}

export const PasswordSetupTemplate = ({ email, isCloud, siteUrl, callback_url, token }: PasswordSetupTemplateProps) => {
  return (
    <BaseEmailWrapper title="Password Setup" preview="Setup your password for Infisical." siteUrl={siteUrl}>
      <Heading className="text-black text-[18px] leading-[28px] text-center font-normal p-0 mx-0">
        <strong>Password Setup</strong>
      </Heading>
      <Section className="px-[24px] mb-[28px] mt-[36px] pt-[12px] pb-[8px] border border-solid border-gray-200 rounded-md bg-gray-50">
        <Text className="text-[14px]">Someone requested to set up a password for your Infisical account.</Text>
        <Text className="text-[14px] text-red-600">
          Make sure you are already logged in to Infisical in the current browser before clicking the link below.
        </Text>
        <Text className="text-[14px]">
          If you did not initiate this request, please contact{" "}
          {isCloud ? (
            <>
              us immediately at <BaseLink href="mailto:support@infisical.com">support@infisical.com</BaseLink>
            </>
          ) : (
            "your administrator immediately"
          )}
          .
        </Text>
      </Section>
      <Section className="text-center">
        <Button
          href={`${callback_url}?token=${token}&to=${encodeURIComponent(email)}`}
          className="rounded-md p-3 px-[28px] my-[8px] text-center text-[16px] bg-[#EBF852] border-solid border border-[#d1e309] text-black font-medium"
        >
          Set Up Password
        </Button>
      </Section>
    </BaseEmailWrapper>
  );
};

export default PasswordSetupTemplate;

PasswordSetupTemplate.PreviewProps = {
  email: "casey@infisical.com",
  callback_url: "https://app.infisical.com",
  isCloud: true,
  siteUrl: "https://infisical.com",
  token: "preview-token"
} as PasswordSetupTemplateProps;
