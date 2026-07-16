import { Heading, Section, Text } from "@react-email/components";

import { BaseButton } from "./BaseButton";
import { BaseEmailWrapper, BaseEmailWrapperProps } from "./BaseEmailWrapper";

interface AlarmNotificationTemplateProps extends Omit<BaseEmailWrapperProps, "title" | "preview" | "children"> {
  alarmName: string;
  eventLabel: string;
  resourceKind: string;
  summary: string;
  condition?: string;
  viewUrl: string;
  items: { title: string; identifier?: string; fields?: { label: string; value: string }[] }[];
}

export const AlarmNotificationTemplate = ({
  alarmName,
  eventLabel,
  resourceKind,
  summary,
  viewUrl,
  siteUrl,
  items
}: AlarmNotificationTemplateProps) => {
  const title = `${resourceKind} ${eventLabel} Notice`;

  return (
    <BaseEmailWrapper title={title} preview={summary} siteUrl={siteUrl}>
      <Heading className="text-black text-[18px] leading-[28px] text-center font-normal p-0 mx-0">
        <strong>{title}</strong>
      </Heading>

      <Section className="px-[24px] mb-[28px] mt-[36px] pt-[12px] pb-[8px] border border-solid border-gray-200 rounded-md bg-gray-50">
        <Text className="text-[14px]">
          Alarm {alarmName}: {summary}
        </Text>
      </Section>

      <Section className="mb-[28px]">
        {items.map((item) => (
          <Section
            key={item.identifier ?? item.title}
            className="mb-[16px] p-[16px] border border-solid border-gray-200 rounded-md bg-gray-50"
          >
            <Text className="text-[14px] font-semibold m-0 mb-[4px]">{item.title}</Text>
            {item.identifier && <Text className="text-[12px] text-gray-600 m-0 mb-[4px]">{item.identifier}</Text>}
            {(item.fields ?? []).map((field) => (
              <Text key={field.label} className="text-[12px] text-gray-600 m-0 mb-[4px]">
                {field.label}: {field.value}
              </Text>
            ))}
          </Section>
        ))}
      </Section>

      <Section className="text-center mt-[32px] mb-[16px]">
        <BaseButton href={viewUrl}>View in Infisical</BaseButton>
      </Section>
    </BaseEmailWrapper>
  );
};

export default AlarmNotificationTemplate;

AlarmNotificationTemplate.PreviewProps = {
  alarmName: "prod-cert-expiry",
  eventLabel: "Expiration",
  resourceKind: "Certificate",
  summary: "2 certificates expiring within 30d",
  condition: "30d",
  viewUrl: "https://infisical.com/organizations/org-1/projects/cert-manager/proj-1/inventory",
  siteUrl: "https://infisical.com",
  items: [
    {
      title: "api.production.company.com",
      identifier: "Serial: 4B:3E:2F:A1:D6:7C:89:45",
      fields: [
        { label: "Expires", value: "November 12, 2025" },
        { label: "Days Until Expiry", value: "7" }
      ]
    },
    {
      title: "web.company.com",
      identifier: "Serial: 8A:7F:1C:E4:92:B5:D3:68",
      fields: [{ label: "Expires", value: "November 10, 2025" }]
    }
  ]
} as AlarmNotificationTemplateProps;
