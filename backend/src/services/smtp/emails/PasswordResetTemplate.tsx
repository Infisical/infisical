import { Heading, Section, Text } from "@react-email/components";
import React from "react";

import { BaseButton } from "./BaseButton";
import { BaseEmailWrapper, BaseEmailWrapperProps } from "./BaseEmailWrapper";
import { BaseLink } from "./BaseLink";

interface PasswordResetTemplateProps extends Omit<BaseEmailWrapperProps, "title" | "preview" | "children"> {
  email: string;
  callback_url: string;
  token: string;
  isCloud: boolean;
}

export const PasswordResetTemplate = ({ email, isCloud, siteUrl, callback_url, token }: PasswordResetTemplateProps) => {
  return (
    <BaseEmailWrapper
      title="Account Recovery"
      preview="A password reset was requested for your Infisical account."
      siteUrl={siteUrl}
    >
      <Heading className="text-black text-[18px] leading-[28px] text-center font-normal p-0 mx-0">
        <strong>Account Recovery</strong>
      </Heading>
      <Section className="px-[24px] mb-[28px] mt-[36px] pt-[12px] pb-[8px] border border-solid border-gray-200 rounded-md bg-gray-50">
        <Text className="text-[14px]">A password reset was requested for your Infisical account.</Text>
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
        <BaseButton href={`${callback_url}?token=${token}&to=${encodeURIComponent(email)}`}>Reset Password</BaseButton>
      </Section>
    </BaseEmailWrapper>
  );
};

export default PasswordResetTemplate;

PasswordResetTemplate.PreviewProps = {
  email: "kevin@infisical.com",
  callback_url: "https://app.infisical.com",
  isCloud: true,
  token: "preview-token",
  siteUrl: "https://infisical.com"
} as PasswordResetTemplateProps;
