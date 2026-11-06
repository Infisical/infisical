import { Heading, Section, Text } from "@react-email/components";
import React from "react";

import { BaseButton } from "./BaseButton";
import { BaseEmailWrapper, BaseEmailWrapperProps } from "./BaseEmailWrapper";
import { BaseLink } from "./BaseLink";

interface SecretScanningSecretsDetectedTemplateProps extends Omit<
  BaseEmailWrapperProps,
  "title" | "preview" | "children"
> {
  numberOfSecrets: number;
  isDiffScan: boolean;
  // the secrets were found in a Claude Code prompt
  isPromptScan?: boolean;
  // for a Claude Code prompt: whether the data source blocks prompts with secrets, or only reports them
  isPromptBlocked?: boolean;
  authorName?: string;
  authorEmail?: string;
  resourceName: string;
  url: string;
}

export const SecretScanningSecretsDetectedTemplate = ({
  numberOfSecrets,
  siteUrl,
  authorName,
  authorEmail,
  isDiffScan,
  isPromptScan,
  isPromptBlocked = true,
  resourceName,
  url
}: SecretScanningSecretsDetectedTemplateProps) => {
  if (isPromptScan) {
    return (
      <BaseEmailWrapper
        title="Incident Alert: Secret(s) Leaked"
        preview={
          isPromptBlocked
            ? "Infisical blocked a Claude Code prompt that contained secrets."
            : "A Claude Code prompt that contained secrets was sent to Claude."
        }
        siteUrl={siteUrl}
      >
        <Heading className="text-black text-[18px] leading-[28px] text-center font-normal p-0 mx-0">
          Infisical has uncovered <strong>{numberOfSecrets}</strong> secret(s) in a Claude Code prompt from{" "}
          <strong>{resourceName}</strong>
        </Heading>
        <Section className="px-[24px] mb-[28px] mt-[36px] pt-[8px] pb-[8px] text-[14px] border border-solid border-gray-200 rounded-md bg-gray-50">
          <Text className="text-[14px]">
            You are receiving this notification because one or more secrets were detected in a Claude Code prompt
            submitted by <strong>{authorName ?? resourceName}</strong>
            {authorEmail && (
              <>
                {" "}
                (<BaseLink href={`mailto:${authorEmail}`}>{authorEmail}</BaseLink>)
              </>
            )}
            .{" "}
            {isPromptBlocked
              ? "The prompt was blocked and was not sent to Claude."
              : "The data source only reports secrets, so the prompt was sent to Claude. Treat these secrets as exposed."}
          </Text>
          <Text className="text-[14px]">
            {isPromptBlocked
              ? "Prompts with these secrets stay blocked until the findings are marked as false positive or ignored."
              : "Developers are warned about these secrets until the findings are marked as false positive or ignored."}{" "}
            A resolved secret that is sent again is reported as a new finding.
          </Text>
          <Text className="text-[14px]">
            Review the findings in the <BaseLink href={url}>Infisical Dashboard</BaseLink>.
          </Text>
        </Section>
        <Section className="text-center">
          <BaseButton href={url}>View Leaked Secrets</BaseButton>
        </Section>
      </BaseEmailWrapper>
    );
  }

  return (
    <BaseEmailWrapper
      title="Incident Alert: Secret(s) Leaked"
      preview="Infisical uncovered one or more leaked secrets."
      siteUrl={siteUrl}
    >
      <Heading className="text-black text-[18px] leading-[28px] text-center font-normal p-0 mx-0">
        Infisical has uncovered <strong>{numberOfSecrets}</strong> secret(s)
        {isDiffScan ? " from a recent commit to" : " in"} <strong>{resourceName}</strong>
      </Heading>
      <Section className="px-[24px] mb-[28px] mt-[36px] pt-[8px] pb-[8px] text-[14px] border border-solid border-gray-200 rounded-md bg-gray-50">
        <Text className="text-[14px]">
          You are receiving this notification because one or more leaked secrets have been detected
          {isDiffScan && " in a recent commit"}
          {isDiffScan ? (
            (authorName || authorEmail) && (
              <>
                {" "}
                pushed by <strong>{authorName ?? "Unknown Pusher"}</strong>{" "}
                {authorEmail && (
                  <>
                    (<BaseLink href={`mailto:${authorEmail}`}>{authorEmail}</BaseLink>)
                  </>
                )}
              </>
            )
          ) : (
            <>
              {" "}
              in your resource <strong>{resourceName}</strong>
            </>
          )}
          .
        </Text>
        <Text className="text-[14px]">
          If these are test secrets, please add `infisical-scan:ignore` at the end of the line containing the secret as
          a comment in the given programming language. This will prevent future notifications from being sent out for
          these secrets.
        </Text>
        <Text className="text-[14px] text-red-600">
          If these are production secrets, please rotate them immediately.
        </Text>
        <Text className="text-[14px]">
          Once you have taken action, be sure to update the finding status in the{" "}
          <BaseLink href={url}>Infisical Dashboard</BaseLink>.
        </Text>
      </Section>
      <Section className="text-center">
        <BaseButton href={url}>View Leaked Secrets</BaseButton>
      </Section>
    </BaseEmailWrapper>
  );
};

export default SecretScanningSecretsDetectedTemplate;

SecretScanningSecretsDetectedTemplate.PreviewProps = {
  authorName: "Jim",
  authorEmail: "jim@infisical.com",
  resourceName: "my-resource",
  numberOfSecrets: 3,
  url: "https://infisical.com",
  isDiffScan: true,
  siteUrl: "https://infisical.com"
} as SecretScanningSecretsDetectedTemplateProps;
