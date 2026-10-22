import { BotIcon, UserIcon } from "lucide-react";

import { ActorType } from "@app/hooks/api/auditLogs/enums";

import { TFolderAccessActor } from "./folder-access.utils";

const ActorTypeIcon = ({ type }: { type: TFolderAccessActor["type"] }) =>
  type === ActorType.IDENTITY ? (
    <BotIcon className="size-3.5 shrink-0 text-muted" />
  ) : (
    <UserIcon className="size-3.5 shrink-0 text-muted" />
  );

export const FolderAccessActorOption = ({ actor }: { actor: TFolderAccessActor }) => (
  <div className="flex min-w-0 items-center gap-2">
    <ActorTypeIcon type={actor.type} />
    <span className="truncate">{actor.name}</span>
    <span className="truncate text-xs text-muted">{actor.subtitle}</span>
  </div>
);

export const FolderAccessActorValue = ({ actor }: { actor: TFolderAccessActor }) => (
  <span className="flex items-center gap-1.5">
    <ActorTypeIcon type={actor.type} />
    {actor.name}
  </span>
);
