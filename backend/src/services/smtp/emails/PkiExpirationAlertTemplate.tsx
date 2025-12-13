import { Heading, Section, Text } from "@react-email/components";

import { BaseButton } from "./BaseButton";
import { BaseEmailWrapper, BaseEmailWrapperProps } from "./BaseEmailWrapper";

interface PkiExpirationAlertTemplateProps extends Omit<BaseEmailWrapperProps, "title" | "preview" | "children"> {
  alertName: string;
  alertBeforeDays: number;
  projectId: string;
  items: { type: string; friendlyName: string; serialNumber: string; expiryDate: string }[];
}

export const PkiExpirationAlertTemplate = ({
  alertName,
  siteUrl,
  alertBeforeDays,
  projectId,
  items
}: PkiExpirationAlertTemplateProps) => {
  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric"
      });
    } catch {
      return dateStr;
    }
  };

  const certificateText = items.length === 1 ? "certificate" : "certificates";
  const daysText = alertBeforeDays === 1 ? "1 day" : `${alertBeforeDays} days`;

  const message = `Alert ${alertName}: You have ${items.length === 1 ? "one" : items.length} ${certificateText} that will expire in ${daysText}.`;

  return (
    <BaseEmailWrapper title="Certificate Expiration Notice" preview={message} siteUrl={siteUrl}>
      <Heading className="text-black text-[18px] leading-[28px] text-center font-normal p-0 mx-0">
        <strong>Certificate Expiration Notice</strong>
      </Heading>

      <Section className="px-[24px] mb-[28px] mt-[36px] pt-[12px] pb-[8px] border border-solid border-gray-200 rounded-md bg-gray-50">
        <Text className="text-[14px]">
          Alert <strong className="font-semibold">{alertName}</strong>: You have{" "}
          {items.length === 1 ? "one" : items.length} {certificateText} that will expire in {daysText}.
        </Text>
      </Section>
      <Section className="mb-[28px]">
        <Text className="text-[14px] font-semibold mb-[12px]">Expiring certificates:</Text>
        {items.map((item) => (
          <Section
            key={item.serialNumber}
            className="mb-[16px] p-[16px] border border-solid border-gray-200 rounded-md bg-gray-50"
          >
            <Text className="text-[14px] font-semibold m-0 mb-[4px]">{item.friendlyName}</Text>
            <Text className="text-[12px] text-gray-600 m-0 mb-[4px]">Serial: {item.serialNumber}</Text>
            <Text className="text-[12px] text-gray-600 m-0">Expires: {formatDate(item.expiryDate)}</Text>
          </Section>
        ))}
      </Section>

      <Section className="text-center mt-[32px] mb-[16px]">
        <BaseButton href={`${siteUrl}/projects/cert-manager/${projectId}/policies`}>View Certificate Alerts</BaseButton>
      </Section>
    </BaseEmailWrapper>
  );
};

export default PkiExpirationAlertTemplate;

PkiExpirationAlertTemplate.PreviewProps = {
  alertBeforeDays: 7,
  items: [
    {
      type: "Certificate",
      friendlyName: "api.production.company.com",
      serialNumber: "4B:3E:2F:A1:D6:7C:89:45:B2:E8:7F:1A:3D:9C:5E:8B",
      expiryDate: "2025-11-12"
    },
    {
      type: "Certificate",
      friendlyName: "web.company.com",
      serialNumber: "8A:7F:1C:E4:92:B5:D3:68:F1:A2:7E:9B:4C:6D:5A:3F",
      expiryDate: "2025-11-10"
    }
  ],
  alertName: "Production SSL Certificate Expiration Alert",
  projectId: "c3b0ef29-915b-4cb1-8684-65b91b7fe02d",
  siteUrl: "https://infisical.com"
} as PkiExpirationAlertTemplateProps;
