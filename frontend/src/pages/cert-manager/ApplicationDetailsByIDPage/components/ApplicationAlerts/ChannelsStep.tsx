import { useState } from "react";
import { FieldArrayWithId, UseFormReturn, useWatch } from "react-hook-form";
import { BellIcon } from "lucide-react";

import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";
import {
  Combobox,
  Empty,
  EmptyDescription,
  EmptyMedia,
  FieldDescription,
  FieldError
} from "@app/components/v3";
import { useSubscription } from "@app/context";
import { isValidEmail } from "@app/helpers/email";
import {
  AlertChannelType,
  AlertPrincipalType,
  CertificateAlertResourceType
} from "@app/hooks/api/alerts";
import { AddChannelMenu, ChannelCard, TChannelRecipientsRenderProps } from "@app/views/Alerts";

import {
  getAlertResourceId,
  MAX_CHANNELS,
  normalizeEmail,
  TCertificateAlertForm,
  TCertificateAlertScope,
  TMemberEmails,
  toRecipientEmails
} from "./types";

type TChannelField = FieldArrayWithId<TCertificateAlertForm, "channels">;

const ENTERPRISE_CHANNEL_TYPES = [
  AlertChannelType.Slack,
  AlertChannelType.Webhook,
  AlertChannelType.PagerDuty
];

export const CertificateAlertAddChannelMenu = ({
  channelCount,
  onAdd
}: {
  channelCount: number;
  onAdd: (channelType: AlertChannelType) => void;
}) => {
  const { subscription } = useSubscription();
  const [isUpgradeOpen, setIsUpgradeOpen] = useState(false);
  const isEnterpriseAllowed = Boolean(subscription?.pkiEnterpriseAlerting);

  return (
    <>
      <AddChannelMenu
        onAdd={onAdd}
        isDisabled={channelCount >= MAX_CHANNELS}
        lockedChannelTypes={isEnterpriseAllowed ? [] : ENTERPRISE_CHANNEL_TYPES}
        onLockedSelect={() => setIsUpgradeOpen(true)}
        label="Add Channel"
        contentClassName="min-w-56"
      />
      <UpgradePlanModal
        isOpen={isUpgradeOpen}
        onOpenChange={setIsUpgradeOpen}
        paywallKey="cert-manager.application-alert-channels"
        text="Webhook, Slack, and PagerDuty alert channels are available on the Enterprise plan."
        isEnterpriseFeature
      />
    </>
  );
};

const EmailRecipientsField = ({
  value,
  onChange,
  isError,
  members
}: TChannelRecipientsRenderProps & { members: TMemberEmails }) => {
  const emails = toRecipientEmails(value, members);
  const groups = value.filter((recipient) => recipient.principalType === AlertPrincipalType.Group);
  const unlistedUsers = value.filter(
    (recipient) =>
      recipient.principalType === AlertPrincipalType.User &&
      !members.emailByUserId.has(recipient.principalId)
  );
  const memberEmails = [...members.memberIdByEmail.keys()].sort();

  const setEmails = (nextEmails: string[]) =>
    onChange([
      ...nextEmails.map((email) => {
        const userId = members.memberIdByEmail.get(email);
        return userId
          ? { principalType: AlertPrincipalType.User, principalId: userId }
          : { principalType: AlertPrincipalType.Email, principalId: email };
      }),
      ...unlistedUsers,
      ...groups
    ]);

  return (
    <>
      <Combobox
        multiple
        modal
        includeMissingSelectedOptions
        options={memberEmails}
        value={emails}
        onValueChange={setEmails}
        getOptionValue={(email) => email}
        getOptionLabel={(email) => email}
        placeholder="Select members or type an email..."
        emptyMessage="No matching members. Type a full email to add it."
        isError={isError}
        creation={{
          isValid: (inputValue) => isValidEmail(normalizeEmail(inputValue)),
          isDuplicate: (inputValue, email) => normalizeEmail(inputValue) === email,
          formatLabel: (inputValue) => `Add "${normalizeEmail(inputValue)}"`,
          emptyLabel: "Add email",
          onCreate: (inputValue) => {
            const email = normalizeEmail(inputValue);
            if (!emails.includes(email)) setEmails([...emails, email]);
          }
        }}
      />
      <FieldDescription>
        Pick organization members or type an email address on a verified email domain.
        {unlistedUsers.length > 0 && ` Also sent to ${unlistedUsers.length} member(s).`}
        {groups.length > 0 && ` Also sent to ${groups.length} group(s).`}
      </FieldDescription>
    </>
  );
};

export const ChannelsStep = ({
  form,
  fields,
  onRemove,
  projectId,
  scope,
  alertId,
  members
}: {
  form: UseFormReturn<TCertificateAlertForm>;
  fields: TChannelField[];
  onRemove: (index: number) => void;
  projectId: string;
  scope: TCertificateAlertScope;
  alertId?: string;
  members: TMemberEmails;
}) => {
  const channelsError = form.formState.errors.channels?.root ?? form.formState.errors.channels;
  const eventType = useWatch({ control: form.control, name: "eventType" });

  if (!fields.length) {
    return (
      <div className="flex flex-col gap-2">
        <Empty className="border">
          <EmptyMedia variant="icon">
            <BellIcon />
          </EmptyMedia>
          <EmptyDescription>
            Select &quot;Add Channel&quot; to choose where this alert is sent.
          </EmptyDescription>
        </Empty>
        <FieldError errors={[channelsError as { message?: string } | undefined]} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {fields.map((field, index) => (
        <ChannelCard
          key={field.id}
          index={index}
          projectId={projectId}
          resourceType={CertificateAlertResourceType.Application}
          resourceId={getAlertResourceId(scope)}
          alertId={alertId}
          eventType={eventType}
          canRemove
          onRemove={() => onRemove(index)}
          renderRecipients={(props) => <EmailRecipientsField {...props} members={members} />}
        />
      ))}
    </div>
  );
};
