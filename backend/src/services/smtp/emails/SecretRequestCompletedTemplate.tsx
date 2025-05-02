import { Button, Heading, Section, Text } from "@react-email/components";
import React from "react";

import { BaseEmailWrapper, BaseEmailWrapperProps } from "./BaseEmailWrapper";

interface SecretRequestCompletedTemplateProps extends Omit<BaseEmailWrapperProps, "title" | "preview" | "children"> {
  name?: string;
  respondentUsername: string;
  secretRequestUrl: string;
}

export const SecretRequestCompletedTemplate = ({
  name,
  siteUrl,
  respondentUsername,
  secretRequestUrl
}: SecretRequestCompletedTemplateProps) => {
  return (
    <BaseEmailWrapper title="Shared Secret" preview="A secret has been shared with you." siteUrl={siteUrl}>
      <Heading className="text-black text-[18px] leading-[28px] text-center font-normal p-0 mx-0">
        <strong>A secret has been shared with you</strong>
      </Heading>
      <Section className="px-[24px] mt-[36px] pt-[12px] text-center pb-[8px] border border-solid border-gray-200 rounded-md bg-gray-50">
        <Text className="text-[14px]">
          {respondentUsername ? <strong>{respondentUsername}</strong> : "Someone"} shared a secret{" "}
          {name && (
            <>
              <strong>{name}</strong>{" "}
            </>
          )}{" "}
          with you.
        </Text>
      </Section>
      <Section className="text-center mt-[28px]">
        <Button
          href={secretRequestUrl}
          className="rounded-md p-3 px-[28px] my-[8px] text-center text-[16px] bg-[#EBF852] border-solid border border-[#d1e309] text-black font-medium"
        >
          View Secret
        </Button>
      </Section>
    </BaseEmailWrapper>
  );
};

export default SecretRequestCompletedTemplate;

SecretRequestCompletedTemplate.PreviewProps = {
  respondentUsername: "Gracie",
  siteUrl: "https://infisical.com",
  secretRequestUrl: "https://infisical.com",
  name: "API_TOKEN"
} as SecretRequestCompletedTemplateProps;
