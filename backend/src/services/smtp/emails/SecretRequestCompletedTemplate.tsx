import { Heading, Section, Text } from "@react-email/components";
import React from "react";

import { BaseButton } from "./BaseButton";
import { BaseEmailWrapper, BaseEmailWrapperProps } from "./BaseEmailWrapper";

interface SecretRequestCompletedTemplateProps extends Omit<BaseEmailWrapperProps, "title" | "preview" | "children"> {
  name?: string;
  senderUsername?: string;
  secretRequestUrl: string;
}

export const SecretRequestCompletedTemplate = ({
  name,
  siteUrl,
  senderUsername,
  secretRequestUrl
}: SecretRequestCompletedTemplateProps) => {
  return (
    <BaseEmailWrapper title="Shared Secret" preview="A secret has been shared with you." siteUrl={siteUrl}>
      <Heading className="text-black text-[18px] leading-[28px] text-center font-normal p-0 mx-0">
        <strong>A secret has been shared with you</strong>
      </Heading>
      <Section className="px-[24px] mb-[28px] mt-[36px] pt-[12px] text-center pb-[8px] border border-solid border-gray-200 rounded-md bg-gray-50">
        <Text className="text-[14px]">
          {senderUsername ? <strong>{senderUsername}</strong> : "Someone"} shared a secret{" "}
          {name && (
            <>
              <strong>{name}</strong>{" "}
            </>
          )}{" "}
          with you.
        </Text>
      </Section>
      <Section className="text-center">
        <BaseButton href={secretRequestUrl}>View Secret</BaseButton>
      </Section>
    </BaseEmailWrapper>
  );
};

export default SecretRequestCompletedTemplate;

SecretRequestCompletedTemplate.PreviewProps = {
  senderUsername: "Gracie",
  siteUrl: "https://infisical.com",
  secretRequestUrl: "https://infisical.com",
  name: "API_TOKEN"
} as SecretRequestCompletedTemplateProps;
