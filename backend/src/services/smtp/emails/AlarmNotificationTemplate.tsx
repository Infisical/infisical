import { Column, Heading, Hr, Row, Section, Text } from "@react-email/components";

import { BaseButton } from "./BaseButton";
import { BaseEmailWrapper, BaseEmailWrapperProps } from "./BaseEmailWrapper";

interface AlarmNotificationTemplateProps extends Omit<BaseEmailWrapperProps, "title" | "preview" | "children"> {
  alarmName: string;
  eventLabel: string;
  resourceKind: string;
  summary: string;
  severity?: string;
  condition?: string;
  viewUrl: string;
  items: { title: string; identifier?: string; fields?: { label: string; value: string }[] }[];
}

const SEVERITY_STYLES: Record<string, { label: string; color: string; background: string; border: string }> = {
  critical: { label: "Critical", color: "#b42318", background: "#fef3f2", border: "#fda29b" },
  error: { label: "Error", color: "#b93815", background: "#fef6ee", border: "#f9b98a" },
  warning: { label: "Warning", color: "#b54708", background: "#fffaeb", border: "#fedf89" },
  info: { label: "Info", color: "#175cd3", background: "#eff8ff", border: "#b2ddff" }
};

export const AlarmNotificationTemplate = ({
  alarmName,
  eventLabel,
  resourceKind,
  summary,
  severity = "info",
  condition,
  viewUrl,
  siteUrl,
  items
}: AlarmNotificationTemplateProps) => {
  const title = `${resourceKind} ${eventLabel} Notice`;
  const sev = SEVERITY_STYLES[severity] ?? SEVERITY_STYLES.info;
  const resourceNoun = resourceKind.toLowerCase();
  const resourceLabel = items.length === 1 ? resourceNoun : `${resourceNoun}s`;

  return (
    <BaseEmailWrapper title={title} preview={summary} siteUrl={siteUrl}>
      <Section className="text-center mb-[16px]">
        <span
          style={{
            display: "inline-block",
            fontSize: "11px",
            fontWeight: 600,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            padding: "4px 10px",
            borderRadius: "9999px",
            color: sev.color,
            backgroundColor: sev.background,
            border: `1px solid ${sev.border}`
          }}
        >
          {sev.label}
        </span>
      </Section>

      <Heading className="text-black text-[20px] leading-[28px] text-center font-semibold p-0 mx-0">{title}</Heading>

      <Text className="text-gray-600 text-[14px] leading-[22px] text-center mt-[8px] mb-[0px]">
        {summary}. Review the {resourceLabel} below and take action before {eventLabel.toLowerCase()} to avoid
        disruption.
      </Text>

      <Section className="mt-[28px] mb-[8px]">
        {items.map((item) => (
          <Section
            key={item.identifier ?? item.title}
            className="mb-[12px] px-[20px] pt-[16px] pb-[8px] border border-solid border-gray-200 rounded-lg bg-gray-50"
          >
            <Text className="text-[15px] font-semibold text-black m-0 mb-[2px]">{item.title}</Text>
            {item.identifier && <Text className="text-[12px] text-gray-500 m-0 mb-[10px]">{item.identifier}</Text>}
            {!item.identifier && <div className="mb-[10px]" />}
            {(item.fields ?? []).map((field) => (
              <Row key={field.label} className="mb-[8px]">
                <Column className="align-top w-[42%]">
                  <Text className="text-[12px] text-gray-500 m-0 leading-[18px]">{field.label}</Text>
                </Column>
                <Column className="align-top">
                  <Text className="text-[12px] text-black font-medium m-0 leading-[18px]">{field.value}</Text>
                </Column>
              </Row>
            ))}
          </Section>
        ))}
      </Section>

      <Section className="text-center mt-[28px] mb-[4px]">
        <BaseButton href={viewUrl}>View in Infisical</BaseButton>
      </Section>

      <Section className="text-center mt-[4px]">
        <Text className="text-[12px] text-gray-500 m-0 leading-[18px]">
          Triggered by alarm <strong className="text-gray-700">{alarmName}</strong>
        </Text>
      </Section>

      <Hr className="mt-[24px] mb-[0px] h-[1px]" />

      <Text className="text-[11px] text-gray-400 text-center leading-[16px] mt-[16px] mb-[0px]">
        You are receiving this because you are a recipient of this alarm. Manage recipients and channels in your
        Infisical alarm settings.
      </Text>
    </BaseEmailWrapper>
  );
};

export default AlarmNotificationTemplate;

AlarmNotificationTemplate.PreviewProps = {
  alarmName: "prod-identity-credential-expiry",
  eventLabel: "Expiration",
  resourceKind: "Identity Credential",
  summary: "2 identity credential(s) expiring within 30d",
  severity: "critical",
  condition: "30d",
  viewUrl: "https://infisical.com/organizations/org-1/access-management?selectedTab=identities",
  siteUrl: "https://infisical.com",
  items: [
    {
      title: "ci-runner",
      fields: [
        { label: "Secret Name", value: "ci-secret" },
        { label: "Secret Type", value: "Universal Auth Client Secret" },
        { label: "Expires", value: "November 12, 2025, 02:30 PM UTC" }
      ]
    },
    {
      title: "deploy-bot",
      fields: [
        { label: "Secret Name", value: "release-token" },
        { label: "Secret Type", value: "Universal Auth Client Secret" },
        { label: "Expires", value: "November 10, 2025, 09:00 AM UTC" }
      ]
    }
  ]
} as AlarmNotificationTemplateProps;
