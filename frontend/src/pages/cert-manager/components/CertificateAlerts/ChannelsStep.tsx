import { useState } from "react";
import { FieldArrayWithId, UseFormReturn } from "react-hook-form";
import { BellIcon, ChevronDownIcon } from "lucide-react";

import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";
import {
  Badge,
  Button,
  Combobox,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Empty,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
  FieldDescription,
  FieldError
} from "@app/components/v3";
import { useSubscription } from "@app/context";
import { isValidEmail } from "@app/helpers/email";
import {
  ALERT_CHANNEL_TYPE_LABELS,
  AlertChannelType,
  AlertPrincipalType
} from "@app/hooks/api/alerts";
import { ChannelCard, TChannelRecipientsRenderProps } from "@app/views/Alerts";

import {
  getAlertResourceId,
  getAlertResourceType,
  MAX_CHANNELS,
  normalizeEmail,
  TCertificateAlertForm,
  TCertificateAlertScope,
  toRecipientEmails,
  TProjectMemberEmails
} from "./types";

type TChannelField = FieldArrayWithId<TCertificateAlertForm, "channels">;

const CHANNEL_TYPES = [
  AlertChannelType.Email,
  AlertChannelType.Webhook,
  AlertChannelType.Slack,
  AlertChannelType.PagerDuty
];

export const AddChannelMenu = ({
  channelCount,
  onAdd
}: {
  channelCount: number;
  onAdd: (channelType: AlertChannelType) => void;
}) => {
  const { subscription } = useSubscription();
  const [isUpgradeOpen, setIsUpgradeOpen] = useState(false);
  const isEnterpriseAllowed = Boolean(subscription?.pkiEnterpriseAlerting);

  const addChannel = (channelType: AlertChannelType) => {
    if (channelType !== AlertChannelType.Email && !isEnterpriseAllowed) {
      setIsUpgradeOpen(true);
      return;
    }
    onAdd(channelType);
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" isDisabled={channelCount >= MAX_CHANNELS}>
            Add Channel
            <ChevronDownIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-56">
          {CHANNEL_TYPES.map((channelType) => (
            <DropdownMenuItem key={channelType} onClick={() => addChannel(channelType)}>
              <span className="flex w-full items-center justify-between gap-4">
                {ALERT_CHANNEL_TYPE_LABELS[channelType]}
                {channelType !== AlertChannelType.Email && !isEnterpriseAllowed && (
                  <Badge variant="neutral">Enterprise</Badge>
                )}
              </span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
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
}: TChannelRecipientsRenderProps & { members: TProjectMemberEmails }) => {
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
          onCreate: (inputValue) => {
            const email = normalizeEmail(inputValue);
            if (!emails.includes(email)) setEmails([...emails, email]);
          }
        }}
      />
      <FieldDescription>
        Pick Certificate Manager members or type any email address. Other addresses must use one of
        your organization&apos;s verified email domains.
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
  members
}: {
  form: UseFormReturn<TCertificateAlertForm>;
  fields: TChannelField[];
  onRemove: (index: number) => void;
  projectId: string;
  scope: TCertificateAlertScope;
  members: TProjectMemberEmails;
}) => {
  const channelsError = form.formState.errors.channels?.root ?? form.formState.errors.channels;

  if (!fields.length) {
    return (
      <div className="flex flex-col gap-2">
        <Empty className="border">
          <EmptyMedia variant="icon">
            <BellIcon />
          </EmptyMedia>
          <EmptyTitle>No notification channels</EmptyTitle>
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
          resourceType={getAlertResourceType(scope)}
          resourceId={getAlertResourceId(scope)}
          canRemove
          onRemove={() => onRemove(index)}
          renderRecipients={(props) => <EmailRecipientsField {...props} members={members} />}
        />
      ))}
    </div>
  );
};
