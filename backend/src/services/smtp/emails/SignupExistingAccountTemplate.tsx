import { Heading, Section, Text } from "@react-email/components";
import React from "react";

import { BaseButton } from "./BaseButton";
import { BaseEmailWrapper, BaseEmailWrapperProps } from "./BaseEmailWrapper";
import { BaseLink } from "./BaseLink";

interface SignupExistingAccountTemplateProps extends Omit<BaseEmailWrapperProps, "title" | "preview" | "children"> {
  email: string;
  loginUrl: string;
  resetPasswordUrl: string;
  isCloud: boolean;
}

export const SignupExistingAccountTemplate = ({
  email,
  loginUrl,
  resetPasswordUrl,
  isCloud,
  siteUrl
}: SignupExistingAccountTemplateProps) => {
  return (
    <BaseEmailWrapper
      title="Sign-up Request Received"
      preview="You already have an Infisical account."
      siteUrl={siteUrl}
    >
      <Heading className="text-black text-[18px] leading-[28px] text-center font-normal p-0 mx-0">
        <strong>Sign-up Request Received</strong>
      </Heading>
      <Section className="px-[24px] mb-[28px] mt-[36px] pt-[12px] pb-[8px] border border-solid border-gray-200 rounded-md bg-gray-50">
        <Text className="text-[14px]">
          We received a sign-up request for your Infisical account (<strong>{email}</strong>).
        </Text>
        <Text className="text-[14px]">
          Since you already have an account, you can sign in or reset your password using the options below:
        </Text>
      </Section>
      <Section className="text-center">
        <BaseButton href={loginUrl}>Sign in to your account</BaseButton>
      </Section>
      <Section className="text-center">
        <BaseButton href={resetPasswordUrl}>Reset your password</BaseButton>
      </Section>
      <Section className="px-[24px] mb-[28px] mt-[28px] pt-[12px] pb-[8px] border border-solid border-gray-200 rounded-md bg-gray-50">
        <Text className="text-[14px]">If you did not request this, you can ignore this message.</Text>
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

export default SignupExistingAccountTemplate;

SignupExistingAccountTemplate.PreviewProps = {
  email: "user@example.com",
  loginUrl: "https://app.infisical.com/login",
  resetPasswordUrl: "https://app.infisical.com/forgot-password",
  isCloud: true,
  siteUrl: "https://infisical.com"
} as SignupExistingAccountTemplateProps;
