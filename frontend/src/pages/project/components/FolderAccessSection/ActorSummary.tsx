import { ActorIdentity } from "@app/pages/secret-manager/OverviewPage/components/FolderAccessSheet/FolderAccessRow";

import { toFolderAccessActor } from "./folder-access-section.utils";
import { TFolderAccessSectionActor } from "./types";

export const ActorSummary = ({ actor }: { actor: TFolderAccessSectionActor }) => (
  <div className="flex min-w-0 items-center gap-3 rounded-md border border-border bg-neutral/5 px-3 py-2">
    <ActorIdentity actor={toFolderAccessActor(actor)} />
  </div>
);
