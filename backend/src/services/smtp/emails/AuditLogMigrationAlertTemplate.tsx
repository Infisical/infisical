import { Heading, Section, Text } from "@react-email/components";

import { BaseEmailWrapper, BaseEmailWrapperProps } from "./BaseEmailWrapper";
import { BaseLink } from "./BaseLink";

type AuditLogMigrationAlertTemplateProps = Omit<BaseEmailWrapperProps, "title" | "preview" | "children">;

export const AuditLogMigrationAlertTemplate = ({ siteUrl }: AuditLogMigrationAlertTemplateProps) => {
  return (
    <BaseEmailWrapper
      title="Action recommended: Audit log storage is large"
      preview="Your audit log table has grown to a size that may impact query performance."
      siteUrl={siteUrl}
    >
      <Heading className="text-black text-[18px] leading-[28px] text-center font-normal p-0 mx-0">
        Action Recommended: Audit Log Storage is Large
      </Heading>
      <Section className="px-[24px] mt-[36px] pt-[12px] pb-[8px] border border-solid border-gray-200 rounded-md bg-gray-50">
        <Text className="text-black text-[14px] leading-[24px]">
          Your Infisical audit log table has grown to a size where PostgreSQL analytical queries will degrade over time
          regardless of hardware tier.
        </Text>
        <Text className="text-black text-[14px] leading-[24px]">
          To maintain query performance and reduce storage costs, we recommend configuring ClickHouse as your audit log
          storage backend. ClickHouse provides columnar storage with superior compression and query performance
          optimized for audit log analytics at scale.
        </Text>
        <Text className="text-black text-[14px] leading-[24px]">
          Learn more:{" "}
          <BaseLink href={`${siteUrl}/docs/documentation/platform/audit-logs-clickhouse-setup`}>
            ClickHouse Setup Guide
          </BaseLink>
        </Text>
      </Section>
    </BaseEmailWrapper>
  );
};

export default AuditLogMigrationAlertTemplate;

AuditLogMigrationAlertTemplate.PreviewProps = {
  siteUrl: "https://infisical.com"
} as AuditLogMigrationAlertTemplateProps;
