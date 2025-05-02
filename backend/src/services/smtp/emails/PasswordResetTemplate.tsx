import { Button, Heading, Link, Section, Text } from "@react-email/components";
import React from "react";

import { BaseEmailWrapper, BaseEmailWrapperProps } from "./BaseEmailWrapper";

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
      <Section className="px-[24px] mt-[36px] pt-[12px] pb-[8px] border border-solid border-gray-200 rounded-md bg-gray-50">
        <Text className="text-[14px]">A password reset was requested for your Infisical account.</Text>
        <Text className="text-[14px]">
          If you did not initiate this request, please contact{" "}
          {isCloud ? (
            <>
              us immediately at{" "}
              <Link href="mailto:support@infisical.com" className="text-slate-700 no-underline">
                support@infisical.com
              </Link>
            </>
          ) : (
            "your administrator immediately"
          )}
          .
        </Text>
      </Section>
      <Section className="text-center mt-[28px]">
        <Button
          href={`${callback_url}?token=${token}&to=${encodeURIComponent(email)}`}
          className="rounded-md p-3 px-[28px] my-[8px] text-center text-[16px] bg-[#EBF852] border-solid border border-[#d1e309] text-black font-medium"
        >
          Reset Password
        </Button>
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
