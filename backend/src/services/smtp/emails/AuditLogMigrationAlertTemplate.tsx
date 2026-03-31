import { Heading, Section, Text } from "@react-email/components";

import { BaseButton } from "./BaseButton";
import { BaseEmailWrapper, BaseEmailWrapperProps } from "./BaseEmailWrapper";

type AuditLogMigrationAlertTemplateProps = Omit<BaseEmailWrapperProps, "title" | "preview" | "children">;

export const AuditLogMigrationAlertTemplate = ({ siteUrl }: AuditLogMigrationAlertTemplateProps) => {
  return (
    <BaseEmailWrapper
      title={`Action Recommended\nOptimize your audit log storage`}
      preview="Your audit log volume is growing. Stream logs externally or use ClickHouse to keep searches fast."
      siteUrl={siteUrl}
    >
      <Heading className="text-black text-[18px] leading-[28px] text-center font-normal p-0 mx-0">
        Action Recommended
        <br />
        Optimize your audit log storage
      </Heading>
      <Section className="px-[24px] mt-[36px] pt-[12px] pb-[8px] border border-solid border-gray-200 rounded-md bg-gray-50">
        <Text className="text-black text-[14px] leading-[24px]">
          Your audit log volume is growing. To keep searches fast and reduce database load, we recommend streaming logs
          to an external destination like Splunk or using the built-in ClickHouse integration.
        </Text>
        <Section className="text-center mt-[16px]">
          <BaseButton href={`${siteUrl}/docs/documentation/platform/audit-log-streams/audit-log-streams`}>
            Set Up Audit Log Streams
          </BaseButton>
        </Section>
        <Section className="text-center mt-[8px]">
          <BaseButton href={`${siteUrl}/docs/documentation/platform/audit-logs-clickhouse-setup`}>
            View ClickHouse Setup Guide
          </BaseButton>
        </Section>
      </Section>
    </BaseEmailWrapper>
  );
};

export default AuditLogMigrationAlertTemplate;

AuditLogMigrationAlertTemplate.PreviewProps = {
  siteUrl: "https://infisical.com"
} as AuditLogMigrationAlertTemplateProps;
