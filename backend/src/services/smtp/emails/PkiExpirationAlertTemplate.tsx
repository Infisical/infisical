import { Heading, Section, Text } from "@react-email/components";

import { BaseButton } from "./BaseButton";
import { BaseEmailWrapper, BaseEmailWrapperProps } from "./BaseEmailWrapper";

interface PkiExpirationAlertTemplateProps extends Omit<BaseEmailWrapperProps, "title" | "preview" | "children"> {
  alertName: string;
  alertBeforeDays: number;
  projectId: string;
  eventLabel?: string;
  items: { type: string; friendlyName: string; serialNumber: string; expiryDate: string; revocationReason?: string }[];
}

const getEventVerb = (eventLabel: string): string => {
  switch (eventLabel) {
    case "Issuance":
      return "been issued";
    case "Renewal":
      return "been renewed";
    case "Revocation":
      return "been revoked";
    default:
      return "";
  }
};

export const PkiExpirationAlertTemplate = ({
  alertName,
  siteUrl,
  alertBeforeDays,
  projectId,
  eventLabel = "Expiration",
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

  const isExpiration = eventLabel === "Expiration";
  const certificateText = items.length === 1 ? "certificate" : "certificates";
  const countText = items.length === 1 ? "one" : String(items.length);

  const title = isExpiration ? "Certificate Expiration Notice" : `Certificate ${eventLabel} Notice`;

  let message: string;
  if (isExpiration) {
    const daysText = alertBeforeDays === 1 ? "1 day" : `${alertBeforeDays} days`;
    message = `Alert ${alertName}: You have ${countText} ${certificateText} expiring within ${daysText}.`;
  } else {
    const verb = getEventVerb(eventLabel);
    message = `Alert ${alertName}: ${items.length === 1 ? "A" : `${items.length}`} ${certificateText} ${items.length === 1 ? "has" : "have"} ${verb}.`;
  }

  const getListHeading = () => {
    if (isExpiration) return "Expiring certificates:";
    switch (eventLabel) {
      case "Issuance":
        return "Issued certificates:";
      case "Renewal":
        return "Renewed certificates:";
      case "Revocation":
        return "Revoked certificates:";
      default:
        return "Certificates:";
    }
  };

  const listHeading = getListHeading();

  return (
    <BaseEmailWrapper title={title} preview={message} siteUrl={siteUrl}>
      <Heading className="text-black text-[18px] leading-[28px] text-center font-normal p-0 mx-0">
        <strong>{title}</strong>
      </Heading>

      <Section className="px-[24px] mb-[28px] mt-[36px] pt-[12px] pb-[8px] border border-solid border-gray-200 rounded-md bg-gray-50">
        <Text className="text-[14px]">{message}</Text>
      </Section>
      <Section className="mb-[28px]">
        <Text className="text-[14px] font-semibold mb-[12px]">{listHeading}</Text>
        {items.map((item) => (
          <Section
            key={item.serialNumber}
            className="mb-[16px] p-[16px] border border-solid border-gray-200 rounded-md bg-gray-50"
          >
            <Text className="text-[14px] font-semibold m-0 mb-[4px]">{item.friendlyName}</Text>
            <Text className="text-[12px] text-gray-600 m-0 mb-[4px]">Serial: {item.serialNumber}</Text>
            <Text className="text-[12px] text-gray-600 m-0 mb-[4px]">Expires: {formatDate(item.expiryDate)}</Text>
            {item.revocationReason && (
              <Text className="text-[12px] text-red-600 m-0">Revocation Reason: {item.revocationReason}</Text>
            )}
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
