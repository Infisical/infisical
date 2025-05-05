import { Button, Heading, Section, Text } from "@react-email/components";
import React from "react";

import { BaseEmailWrapper, BaseEmailWrapperProps } from "./BaseEmailWrapper";

interface UnlockAccountTemplateProps extends Omit<BaseEmailWrapperProps, "title" | "preview" | "children"> {
  token: string;
  callback_url: string;
}

export const UnlockAccountTemplate = ({ token, siteUrl, callback_url }: UnlockAccountTemplateProps) => {
  return (
    <BaseEmailWrapper
      title="Your Infisical Account Has Been Locked"
      preview="Unlock your Infisical account to continue."
      siteUrl={siteUrl}
    >
      <Heading className="text-black text-[18px] leading-[28px] text-center font-normal p-0 mx-0">
        <strong>Unlock your Infisical account</strong>
      </Heading>
      <Section className="px-[24px] mt-[36px] pt-[12px] pb-[8px] border border-solid border-gray-200 rounded-md bg-gray-50">
        <Text className="text-[14px]">
          Your account has been temporarily locked due to multiple failed login attempts.
        </Text>
        <Text>If these attempts were not made by you, reset your password immediately.</Text>
      </Section>
      <Section className="text-center mt-[28px]">
        <Button
          href={`${callback_url}?token=${token}`}
          className="rounded-md p-3 px-[28px] my-[8px] text-center text-[16px] bg-[#EBF852] border-solid border border-[#d1e309] text-black font-medium"
        >
          Unlock Account
        </Button>
      </Section>
    </BaseEmailWrapper>
  );
};

export default UnlockAccountTemplate;

UnlockAccountTemplate.PreviewProps = {
  callback_url: "Example Project",
  siteUrl: "https://infisical.com",
  token: "preview-token"
} as UnlockAccountTemplateProps;
