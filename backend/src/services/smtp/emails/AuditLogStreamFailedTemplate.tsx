import { Heading, Section, Text } from "@react-email/components";
import React from "react";

import { BaseButton } from "./BaseButton";
import { BaseEmailWrapper, BaseEmailWrapperProps } from "./BaseEmailWrapper";

interface AuditLogStreamFailedTemplateProps extends Omit<BaseEmailWrapperProps, "title" | "preview" | "children"> {
  provider: string;
  windowFailureCount: number;
  windowMinutes: number;
  streamUrl: string;
}

export const AuditLogStreamFailedTemplate = ({
  provider,
  windowFailureCount,
  windowMinutes,
  streamUrl,
  siteUrl
}: AuditLogStreamFailedTemplateProps) => {
  return (
    <BaseEmailWrapper
      title="Audit Log Stream Failure"
      preview="Your audit log stream is experiencing repeated failures."
      siteUrl={siteUrl}
    >
      <Heading className="text-black text-[18px] leading-[28px] text-center font-normal p-0 mx-0">
        Your <strong>{provider}</strong> audit log stream is failing
      </Heading>
      <Section className="px-[24px] mb-[28px] mt-[36px] pt-[26px] pb-[4px] text-[14px] border border-solid border-gray-200 rounded-md bg-gray-50">
        <strong>Provider</strong>
        <Text className="text-[14px] mt-[4px]">{provider}</Text>
        <strong>Failures in last {windowMinutes} min</strong>
        <Text className="text-[14px] text-red-600 mt-[4px]">{windowFailureCount}</Text>
      </Section>
      <Text className="text-[14px]">
        Audit logs may not be reaching their destination. This is likely caused by a configuration issue or connectivity
        problem with your audit log stream endpoint. Please review your stream settings.
      </Text>
      <Section className="text-center">
        <BaseButton href={streamUrl}>View Audit Log Streams</BaseButton>
      </Section>
    </BaseEmailWrapper>
  );
};

export default AuditLogStreamFailedTemplate;

AuditLogStreamFailedTemplate.PreviewProps = {
  provider: "Datadog",
  windowFailureCount: 12,
  windowMinutes: 5,
  streamUrl: "https://app.infisical.com/organizations/example-org/settings?selectedTab=tag-audit-log-streams",
  siteUrl: "https://app.infisical.com"
} as AuditLogStreamFailedTemplateProps;
