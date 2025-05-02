import { Heading, Hr, Section, Text } from "@react-email/components";
import React, { Fragment } from "react";

import { BaseEmailWrapper, BaseEmailWrapperProps } from "./BaseEmailWrapper";

interface PkiExpirationAlertTemplateProps extends Omit<BaseEmailWrapperProps, "title" | "preview" | "children"> {
  alertName: string;
  alertBeforeDays: number;
  items: { type: string; friendlyName: string; serialNumber: string; expiryDate: string }[];
}

export const PkiExpirationAlertTemplate = ({
  alertName,
  siteUrl,
  alertBeforeDays,
  items
}: PkiExpirationAlertTemplateProps) => {
  return (
    <BaseEmailWrapper
      title="Infisical CA/Certificate Expiration Notice"
      preview="One or more of your Infisical certificates is about to expire."
      siteUrl={siteUrl}
    >
      <Heading className="text-black text-[18px] leading-[28px] text-center font-normal p-0 mx-0">
        <strong>CA/Certificate Expiration Notice</strong>
      </Heading>
      <Section className="px-[24px] mt-[36px] pt-[12px] pb-[8px] border border-solid border-gray-200 rounded-md bg-gray-50">
        <Text>Hello,</Text>
        <Text className="text-black text-[14px] leading-[24px]">
          This is an automated alert for <strong>{alertName}</strong> triggered for CAs/Certificates expiring in{" "}
          <strong>{alertBeforeDays}</strong> days.
        </Text>
        <Text className="text-[14px] leading-[24px] mb-[4px]">
          <strong>Expiring Items:</strong>
        </Text>
        {items.map((item) => (
          <Fragment key={item.serialNumber}>
            <Hr className="mb-[16px]" />
            <strong className="text-[14px]">{item.type}:</strong>
            <Text className="text-[14px] my-[2px] leading-[24px]">{item.friendlyName}</Text>
            <strong className="text-[14px]">Serial Number:</strong>
            <Text className="text-[14px] my-[2px] leading-[24px]">{item.serialNumber}</Text>
            <strong className="text-[14px]">Expires On:</strong>
            <Text className="text-[14px] mt-[2px] mb-[16px] leading-[24px]">{item.expiryDate}</Text>
          </Fragment>
        ))}
        <Hr />
        <Text className="text-[14px] leading-[24px]">
          Please take the necessary actions to renew these items before they expire.
        </Text>
        <Text className="text-[14px] leading-[24px]">
          For more details, please log in to your Infisical account and check your PKI management section.
        </Text>
      </Section>
    </BaseEmailWrapper>
  );
};

export default PkiExpirationAlertTemplate;

PkiExpirationAlertTemplate.PreviewProps = {
  alertBeforeDays: 5,
  items: [
    { type: "CA", friendlyName: "Example CA", serialNumber: "1234567890", expiryDate: "2032-01-01" },
    { type: "Certificate", friendlyName: "Example Certificate", serialNumber: "2345678901", expiryDate: "2032-01-01" }
  ],
  alertName: "My PKI Alert",
  siteUrl: "https://infisical.com"
} as PkiExpirationAlertTemplateProps;
