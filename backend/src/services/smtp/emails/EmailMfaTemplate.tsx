import { Heading, Link, Section, Text } from "@react-email/components";
import React from "react";

import { BaseEmailWrapper, BaseEmailWrapperProps } from "./BaseEmailWrapper";

interface EmailMfaTemplateProps extends Omit<BaseEmailWrapperProps, "title" | "preview" | "children"> {
  code: string;
  isCloud: boolean;
}

export const EmailMfaTemplate = ({ code, siteUrl, isCloud }: EmailMfaTemplateProps) => {
  return (
    <BaseEmailWrapper title="MFA Code" preview="Sign-in attempt requires further verification." siteUrl={siteUrl}>
      <Heading className="text-black text-[18px] leading-[28px] text-center font-normal p-0 mx-0">
        <strong>MFA required</strong>
      </Heading>
      <Section className="px-[24px] mt-[36px] pt-[8px] text-center pb-[8px] text-[14px] border border-solid border-gray-200 rounded-md bg-gray-50">
        <Text>Enter the MFA code below in the browser where you started sign-in.</Text>
        <Text className="text-[24px] mt-[16px]">
          <strong>{code}</strong>
        </Text>
      </Section>
      <Section className="mt-[24px] bg-gray-50 pt-[2px] pb-[16px] border border-solid border-gray-200 px-[24px] rounded-md text-gray-800">
        <Text className="mb-[0px]">
          <strong>Not you?</strong>{" "}
          {isCloud ? (
            <>
              Contact us at{" "}
              <Link href={`mailto:support@infisical.com`} className="text-slate-700 no-underline">
                support@infisical.com
              </Link>{" "}
              immediately
            </>
          ) : (
            "Contact your administrator immediately"
          )}
          .
        </Text>
      </Section>
    </BaseEmailWrapper>
  );
};

export default EmailMfaTemplate;

EmailMfaTemplate.PreviewProps = {
  code: "124356",
  isCloud: true,
  siteUrl: "https://infisical.com"
} as EmailMfaTemplateProps;
