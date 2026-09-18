import { components, MultiValueGenericProps, OptionProps } from "react-select";
import { BotIcon, CheckIcon, UserIcon } from "lucide-react";

import { ActorType } from "@app/hooks/api/auditLogs/enums";

import { TFolderAccessActor } from "./folder-access.utils";

const ActorTypeIcon = ({ type }: { type: TFolderAccessActor["type"] }) =>
  type === ActorType.IDENTITY ? (
    <BotIcon className="size-3.5 shrink-0 text-muted" />
  ) : (
    <UserIcon className="size-3.5 shrink-0 text-muted" />
  );

export const FolderAccessActorOption = ({
  isSelected,
  children,
  ...props
}: OptionProps<TFolderAccessActor>) => {
  const { type, subtitle } = props.data;

  return (
    <components.Option isSelected={isSelected} {...props}>
      <div className="flex flex-row items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <ActorTypeIcon type={type} />
          <span className="truncate">{children}</span>
          <span className="truncate text-xs text-muted">{subtitle}</span>
        </div>
        {isSelected && <CheckIcon className="size-4 shrink-0" />}
      </div>
    </components.Option>
  );
};

export const FolderAccessActorMultiValueLabel = (
  props: MultiValueGenericProps<TFolderAccessActor>
) => {
  const { data, children } = props;

  return (
    <components.MultiValueLabel {...props}>
      <span className="flex items-center gap-1.5">
        <ActorTypeIcon type={data.type} />
        {children}
      </span>
    </components.MultiValueLabel>
  );
};
