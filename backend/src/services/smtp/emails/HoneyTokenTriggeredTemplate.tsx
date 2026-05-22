import { Heading, Section, Text } from "@react-email/components";
import React from "react";

import { BaseButton } from "./BaseButton";
import { BaseEmailWrapper, BaseEmailWrapperProps } from "./BaseEmailWrapper";

interface HoneyTokenTriggeredTemplateProps extends Omit<BaseEmailWrapperProps, "title" | "preview" | "children"> {
  honeyTokenName: string;
  projectName: string;
  eventName: string;
  eventTime: string;
  sourceIp: string;
  awsRegion: string;
  honeyTokenUrl: string;
}

export const HoneyTokenTriggeredTemplate = ({
  honeyTokenName,
  projectName,
  eventName,
  eventTime,
  sourceIp,
  awsRegion,
  honeyTokenUrl,
  siteUrl
}: HoneyTokenTriggeredTemplateProps) => {
  return (
    <BaseEmailWrapper
      title="Security Alert: Honey Token Triggered"
      preview={`ACTION REQUIRED — Honey token "${honeyTokenName}" was accessed in project "${projectName}". Your secrets may be compromised.`}
      siteUrl={siteUrl}
    >
      <Section className="px-[16px] py-[12px] text-center">
        <Text className="text-red-600 text-[14px] font-bold m-0">ACTION REQUIRED — POTENTIAL SECRET COMPROMISE</Text>
      </Section>
      <Heading className="text-black text-[18px] leading-[28px] text-center font-normal p-0 mx-0 mt-[24px]">
        Honey token <strong>{honeyTokenName}</strong> was accessed in project <strong>{projectName}</strong>
      </Heading>
      <Text className="text-center">
        An unauthorized party may have access to your secrets. Investigate immediately and rotate any secrets that may
        have been exposed.
      </Text>
      <Section className="px-[24px] mt-[24px] pt-[24px] pb-[8px] border border-solid border-gray-200 rounded-md bg-gray-50">
        <strong className="text-[14px]">Event</strong>
        <Text className="text-[14px] mt-[4px]">{eventName}</Text>
        <strong className="text-[14px]">Time</strong>
        <Text className="text-[14px] mt-[4px]">{eventTime}</Text>
        <strong className="text-[14px]">Source IP</strong>
        <Text className="text-[14px] mt-[4px]">{sourceIp}</Text>
        <strong className="text-[14px]">AWS Region</strong>
        <Text className="text-[14px] mt-[4px]">{awsRegion}</Text>
      </Section>
      <Section className="text-center mt-[24px]">
        <BaseButton href={honeyTokenUrl}>Investigate Now</BaseButton>
      </Section>
    </BaseEmailWrapper>
  );
};

export default HoneyTokenTriggeredTemplate;

HoneyTokenTriggeredTemplate.PreviewProps = {
  honeyTokenName: "staging-honey-token",
  projectName: "My Project",
  eventName: "GetSecretValue",
  eventTime: "2026-04-28T12:00:00Z",
  sourceIp: "203.0.113.42",
  awsRegion: "us-east-1",
  honeyTokenUrl: "https://app.infisical.com/project/123",
  siteUrl: "https://infisical.com"
} as HoneyTokenTriggeredTemplateProps;
