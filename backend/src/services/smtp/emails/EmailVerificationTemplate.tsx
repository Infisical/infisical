import { Heading, Link, Section, Text } from "@react-email/components";
import React from "react";

import { BaseEmailWrapper, BaseEmailWrapperProps } from "./BaseEmailWrapper";

interface EmailVerificationTemplateProps extends Omit<BaseEmailWrapperProps, "title" | "preview" | "children"> {
  code: string;
  isCloud: boolean;
}

export const EmailVerificationTemplate = ({ code, siteUrl, isCloud }: EmailVerificationTemplateProps) => {
  return (
    <BaseEmailWrapper
      title="Confirm Your Email Address"
      preview="Verify your email address to continue with Infisical."
      siteUrl={siteUrl}
    >
      <Heading className="text-black text-[18px] leading-[28px] text-center font-normal p-0 mx-0">
        <strong>Confirm your email address</strong>
      </Heading>
      <Section className="px-[24px] mt-[36px] pt-[8px] text-center pb-[8px] text-[14px] border border-solid border-gray-200 rounded-md bg-gray-50">
        <Text>Enter the confirmation code shown below in the browser window requiring confirmation.</Text>
        <Text className="text-[24px] mt-[16px]">
          <strong>{code}</strong>
        </Text>
      </Section>
      <Section className="mt-[24px] bg-gray-50 pt-[2px] pb-[16px] border border-solid border-gray-200 px-[24px] rounded-md text-gray-800">
        <Text className="mb-[0px]">
          <strong>Questions about Infisical?</strong>{" "}
          {isCloud ? (
            <>
              Email us at{" "}
              <Link href="mailto:support@infisical.com" className="text-slate-700 no-underline">
                support@infisical.com
              </Link>
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

export default EmailVerificationTemplate;

EmailVerificationTemplate.PreviewProps = {
  code: "124356",
  isCloud: true,
  siteUrl: "https://infisical.com"
} as EmailVerificationTemplateProps;
