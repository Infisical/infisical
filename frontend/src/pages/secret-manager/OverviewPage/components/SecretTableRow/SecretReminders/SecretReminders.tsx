import { useState } from "react";
import { BellIcon, EllipsisIcon, PencilIcon, PlusIcon, TrashIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  IconButton,
  Popover,
  PopoverAnchor,
  PopoverContent,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  Toggle
} from "@app/components/v3";
import { cn } from "@app/components/v3/utils";
import {
  ALERT_CHANNEL_TYPE_LABELS,
  AlertChannelType,
  TAlert,
  useDeleteAlert,
  useUpdateAlert
} from "@app/hooks/api/alerts";
import { getChannelIcon } from "@app/views/Alerts/channelIcons";

import { formatReminderSchedule, getReminderCondition } from "./secret-reminder-fns";
import { SecretReminderForm } from "./SecretReminderForm";
import { useSecretReminders } from "./useSecretReminders";

type Props = {
  secretId: string;
  secretKey: string;
  environmentName: string;
  canEdit: boolean;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
};

const getEnabledChannelTypes = (alert: TAlert): AlertChannelType[] =>
  Object.values(AlertChannelType).filter((type) =>
    alert.channels.some((channel) => channel.channelType === type && channel.enabled)
  );

const ReminderRow = ({
  reminder,
  canEdit,
  onEdit,
  onRemove
}: {
  reminder: TAlert;
  canEdit: boolean;
  onEdit: () => void;
  onRemove: () => void;
}) => {
  const updateAlert = useUpdateAlert();
  const condition = getReminderCondition(reminder);
  const channelTypes = getEnabledChannelTypes(reminder);

  const handleToggleEnabled = async (enabled: boolean) => {
    try {
      await updateAlert.mutateAsync({ alertId: reminder.id, enabled });
      createNotification({
        text: `Reminder "${reminder.name}" ${enabled ? "enabled" : "disabled"}`,
        type: "success"
      });
    } catch {
      // MutationCache reports request errors globally.
    }
  };

  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <div className={cn("flex min-w-0 flex-col gap-0.5", !reminder.enabled && "opacity-60")}>
        <span className="truncate text-sm text-foreground">{reminder.name}</span>
        <div className="flex min-w-0 items-center gap-2 text-xs text-muted">
          {condition && <span className="truncate">{formatReminderSchedule(condition)}</span>}
          {channelTypes.length > 0 && (
            <>
              <span aria-hidden>·</span>
              <div className="flex shrink-0 items-center gap-1">
                {channelTypes.map((type) => {
                  const ChannelIcon = getChannelIcon(type);
                  return (
                    <ChannelIcon
                      key={type}
                      role="img"
                      aria-label={ALERT_CHANNEL_TYPE_LABELS[type]}
                      className="size-3.5"
                    />
                  );
                })}
              </div>
            </>
          )}
        </div>
        {condition?.note && (
          <span className="line-clamp-1 text-xs text-accent">{condition.note}</span>
        )}
      </div>
      {canEdit ? (
        <div className="flex shrink-0 items-center gap-2">
          <Toggle
            aria-label={`${reminder.enabled ? "Disable" : "Enable"} ${reminder.name}`}
            variant="project"
            checked={reminder.enabled}
            disabled={updateAlert.isPending}
            onCheckedChange={handleToggleEnabled}
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <IconButton
                variant="ghost-muted"
                size="xs"
                aria-label={`Options for ${reminder.name}`}
              >
                <EllipsisIcon />
              </IconButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onEdit}>
                <PencilIcon />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem variant="danger" onClick={onRemove}>
                <TrashIcon />
                Remove
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ) : (
        <Badge variant={reminder.enabled ? "success" : "neutral"}>
          {reminder.enabled ? "Active" : "Disabled"}
        </Badge>
      )}
    </div>
  );
};

export const SecretReminders = ({
  secretId,
  secretKey,
  environmentName,
  canEdit,
  isOpen,
  onOpenChange
}: Props) => {
  const { data: reminders = [] } = useSecretReminders(secretId);
  const deleteAlert = useDeleteAlert();

  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [editingReminder, setEditingReminder] = useState<TAlert>();
  const [removingReminder, setRemovingReminder] = useState<TAlert>();

  const enabledCount = reminders.filter((reminder) => reminder.enabled).length;

  const openForm = (reminder?: TAlert) => {
    setEditingReminder(reminder);
    onOpenChange(false);
    setIsSheetOpen(true);
  };

  const handleRemove = async () => {
    if (!removingReminder) return;
    try {
      await deleteAlert.mutateAsync({ alertId: removingReminder.id });
      createNotification({ text: `Reminder "${removingReminder.name}" removed`, type: "success" });
      setRemovingReminder(undefined);
    } catch {
      // MutationCache reports request errors globally; keep the dialog open.
    }
  };

  return (
    <>
      <Popover open={isOpen} onOpenChange={onOpenChange}>
        <PopoverAnchor asChild>
          <span className="pointer-events-none absolute inset-0" />
        </PopoverAnchor>
        <PopoverContent
          onCloseAutoFocus={(e) => e.preventDefault()}
          className="w-[420px] p-0"
          side="left"
        >
          <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
            <div className="flex min-w-0 flex-col">
              <span className="text-sm font-semibold text-foreground">Reminders</span>
              <span className="truncate text-xs text-accent">
                {secretKey} in {environmentName}
              </span>
            </div>
            {reminders.length > 0 && (
              <span className="shrink-0 text-xs text-muted">
                {enabledCount} of {reminders.length} enabled
              </span>
            )}
          </div>

          {reminders.length ? (
            <div className="max-h-80 divide-y divide-border overflow-y-auto">
              {reminders.map((reminder) => (
                <ReminderRow
                  key={reminder.id}
                  reminder={reminder}
                  canEdit={canEdit}
                  onEdit={() => openForm(reminder)}
                  onRemove={() => {
                    onOpenChange(false);
                    setRemovingReminder(reminder);
                  }}
                />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-1 px-4 py-6 text-center">
              <BellIcon className="mb-1 size-5 text-muted" />
              <span className="text-sm text-foreground">No reminders yet</span>
              <span className="text-xs text-accent">
                Add a reminder to get notified when this secret is due for rotation.
              </span>
            </div>
          )}

          <div className="flex items-center justify-between gap-2 border-t border-border px-4 py-3">
            {canEdit ? (
              <Button variant="project" size="xs" onClick={() => openForm()}>
                <PlusIcon />
                Add Reminder
              </Button>
            ) : (
              <span className="text-xs text-muted">
                You do not have permission to manage reminders on this secret.
              </span>
            )}
            <Button variant="ghost" size="xs" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </div>
        </PopoverContent>
      </Popover>

      <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
        <SheetContent className="flex h-full max-h-full flex-col gap-y-0 sm:max-w-lg">
          <SheetHeader className="border-b">
            <SheetTitle>{editingReminder ? "Edit Reminder" : "Add Reminder"}</SheetTitle>
            <SheetDescription>
              Notify your channels on a schedule for {secretKey} in {environmentName}.
            </SheetDescription>
          </SheetHeader>
          {isSheetOpen && (
            <SecretReminderForm
              key={editingReminder?.id ?? "new"}
              secretId={secretId}
              reminder={editingReminder}
              onComplete={() => setIsSheetOpen(false)}
              onCancel={() => setIsSheetOpen(false)}
            />
          )}
        </SheetContent>
      </Sheet>

      <AlertDialog
        open={Boolean(removingReminder)}
        onOpenChange={(open) => !open && setRemovingReminder(undefined)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Reminder?</AlertDialogTitle>
            <AlertDialogDescription>
              Remove &quot;{removingReminder?.name}&quot; from {secretKey}. Its channels stop
              receiving notifications, and this cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel isDisabled={deleteAlert.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="danger"
              isPending={deleteAlert.isPending}
              onClick={(event) => {
                event.preventDefault();
                handleRemove();
              }}
            >
              Remove Reminder
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
