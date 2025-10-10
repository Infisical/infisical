import { Heading, Section, Text } from "@react-email/components";

import { BaseEmailWrapper, BaseEmailWrapperProps } from "./BaseEmailWrapper";
import { BaseLink } from "./BaseLink";

interface HealthAlertTemplateProps extends Omit<BaseEmailWrapperProps, "title" | "preview" | "children"> {
  type: "gateway" | "relay" | "instance-relay";
  names: string;
}

export const HealthAlertTemplate = ({ siteUrl, names, type }: HealthAlertTemplateProps) => {
  return (
    <BaseEmailWrapper
      title={`${type === "gateway" ? "Gateway" : "Relay"} Health Alert`}
      preview={`Some ${type}s in your organization have failed their health check.`}
      siteUrl={siteUrl}
    >
      <Heading className="text-black text-[18px] leading-[28px] text-center font-normal p-0 mx-0">
        {type === "gateway" ? "Gateway" : "Relay"} Health Alert
      </Heading>
      <Section className="px-[24px] mt-[36px] pt-[12px] pb-[8px] border border-solid border-gray-200 rounded-md bg-gray-50">
        <Text className="text-black text-[14px] leading-[24px]">
          The following <strong>{type}</strong>(s) in your organization may be offline as they haven't reported a
          heartbeat in over an hour: <strong>{names}</strong>.
        </Text>
        <Text className="text-black text-[14px] leading-[24px]">
          {type === "instance-relay" && (
            <>
              If your issue persists, you can contact the Infisical team at{" "}
              <BaseLink href="mailto:support@infisical.com">support@infisical.com</BaseLink>.
            </>
          )}
          {type === "relay" && <>Please contact your relay administrators.</>}
          {type === "gateway" && <>Please contact your gateway administrators.</>}
        </Text>
      </Section>
    </BaseEmailWrapper>
  );
};

export default HealthAlertTemplate;

HealthAlertTemplate.PreviewProps = {
  type: "gateway",
  names: '"gateway1", "gateway2"',
  siteUrl: "https://infisical.com"
} as HealthAlertTemplateProps;
