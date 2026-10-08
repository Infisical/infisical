import { Heading, Section, Text } from "@react-email/components";
import React from "react";

import { BaseEmailWrapper, BaseEmailWrapperProps } from "./BaseEmailWrapper";

interface PamFolderAdminAccessTemplateProps extends Omit<BaseEmailWrapperProps, "title" | "preview"> {
  actorName: string;
  folderName: string;
}

export const PamFolderAdminAccessTemplate = ({ actorName, folderName, siteUrl }: PamFolderAdminAccessTemplateProps) => {
  return (
    <BaseEmailWrapper
      title="Folder Access Granted to PAM Admin"
      preview="A PAM admin has self-issued admin access to a folder in Infisical."
      siteUrl={siteUrl}
    >
      <Heading className="text-black text-[18px] leading-[28px] text-center font-normal p-0 mx-0">
        A PAM admin has joined the folder <strong>{folderName}</strong>
      </Heading>
      <Section className="px-[24px] mt-[36px] pt-[24px] pb-[8px] border border-solid border-gray-200 rounded-md bg-gray-50">
        <Text className="text-[14px] mt-[4px]">
          The PAM admin <strong>{actorName}</strong> has self-issued admin access to the folder{" "}
          <strong>{folderName}</strong>.
        </Text>
      </Section>
    </BaseEmailWrapper>
  );
};

export default PamFolderAdminAccessTemplate;

PamFolderAdminAccessTemplate.PreviewProps = {
  actorName: "kevin@infisical.com",
  folderName: "production",
  siteUrl: "https://infisical.com"
} as PamFolderAdminAccessTemplateProps;
