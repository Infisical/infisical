import { useMemo, useState } from "react";
import {
  faArrowLeft,
  faChevronRight,
  faCodeCommit,
  faFolder,
  faMagnifyingGlass,
  faUndo
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import { Button, ContentLoader, Input, Tag, Tooltip } from "@app/components/v2";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/context";
import { useGetSnapshotSecrets, usePerformSecretRollback } from "@app/hooks/api";
import { SecretV3RawSanitized, TSecretFolder } from "@app/hooks/api/types";

import { renderIcon, SecretItem, TDiffModes, TDiffView } from "./SecretItem";

type Props = {
  snapshotId: string;
  environment: string;
  workspaceId: string;
  secretPath?: string;
  secrets?: SecretV3RawSanitized[];
  folders?: TSecretFolder[];
  snapshotCount?: number;
  onGoBack: () => void;
  onClickListSnapshot: () => void;
};

const LOADER_TEXT = ["Fetching your snapshot", "Creating the difference view"];

const deepCompareSecrets = (lhs: SecretV3RawSanitized, rhs: SecretV3RawSanitized) =>
  lhs.key === rhs.key &&
  lhs.value === rhs.value &&
  lhs.comment === rhs.comment &&
  lhs?.valueOverride === rhs?.valueOverride &&
  JSON.stringify(lhs.tags) === JSON.stringify(rhs.tags);

export const SnapshotView = ({
  snapshotId,
  environment,
  workspaceId,
  secretPath,
  secrets = [],
  folders = [],
  onGoBack,
  snapshotCount,
  onClickListSnapshot
}: Props) => {
  const [search, setSearch] = useState("");
  const { mutateAsync: performRollback, isLoading: isRollingBack } = usePerformSecretRollback();

  const { data: snapshotData, isLoading: isSnapshotLoading } = useGetSnapshotSecrets({
    snapshotId,
    env: environment
  });

  const rollingFolder = snapshotData?.folders || [];
  const rollingSecrets = snapshotData?.secrets || [];

  const folderDiffView = useMemo(() => {
    const folderGroupById = folders.reduce<Record<string, TSecretFolder>>(
      (prev, curr) => ({ ...prev, [curr.id]: curr }),
      {}
    );
    const diffView: Array<TDiffView<TSecretFolder>> = [];
    rollingFolder.forEach((rollFolder) => {
      const { id, name } = rollFolder;
      const doesExist = Boolean(folderGroupById?.[id]);
      if (doesExist) {
        diffView.push({
          mode: name === folderGroupById[id].name ? TDiffModes.NoChange : TDiffModes.Modified,
          pre: folderGroupById[id],
          post: rollFolder
        });
        delete folderGroupById[id];
      } else {
        diffView.push({ mode: TDiffModes.Created, post: rollFolder });
      }
    });
    Object.values(folderGroupById).forEach((folder) => {
      diffView.push({ mode: TDiffModes.Deleted, post: folder });
    });
    return diffView;
  }, [folders, rollingFolder]);

  const secretDiffView = useMemo(() => {
    const secretGroupById = secrets.reduce<Record<string, SecretV3RawSanitized>>(
      (prev, curr) => ({ ...prev, [curr.id]: curr }),
      {}
    );
    const diffView: Array<TDiffView<SecretV3RawSanitized>> = [];
    rollingSecrets.forEach((rollSecret) => {
      const { id } = rollSecret;
      const doesExist = Boolean(secretGroupById?.[id]);
      if (doesExist) {
        diffView.push({
          mode: deepCompareSecrets(rollSecret, secretGroupById[id])
            ? TDiffModes.NoChange
            : TDiffModes.Modified,
          pre: secretGroupById[id],
          post: rollSecret
        });
        delete secretGroupById[id];
      } else {
        diffView.push({ mode: TDiffModes.Created, post: rollSecret });
      }
    });
    Object.values(secretGroupById).forEach((folder) => {
      diffView.push({ mode: TDiffModes.Deleted, post: folder });
    });
    return diffView;
  }, [secrets, rollingSecrets]);

  const handleClickRollback = async () => {
    if (!snapshotData?.id) {
      createNotification({
        text: "Failed to find secret version",
        type: "success"
      });
      return;
    }
    try {
      await performRollback({
        workspaceId,
        snapshotId: snapshotData.id,
        environment,
        directory: secretPath
      });
      createNotification({
        text: "Successfully rollback secrets",
        type: "success"
      });
      onGoBack();
    } catch (error) {
      console.log(error);
      createNotification({
        text: "Failed to rollback secrets",
        type: "error"
      });
    }
  };

  if (isSnapshotLoading) {
    return <ContentLoader text={LOADER_TEXT} />;
  }

  return (
    <>
      <div className="flex items-center space-x-4">
        <h6 className="text-2xl">Snapshot</h6>
        <Tag colorSchema="green">{new Date(snapshotData?.createdAt || "").toLocaleString()}</Tag>
      </div>
      <div className="mt-4 flex items-center space-x-2">
        <div className="w-2/5">
          <Input
            className="bg-mineshaft-800 placeholder-mineshaft-50 duration-200 focus:bg-mineshaft-700/80"
            placeholder="Search by folder name, key name ..."
            leftIcon={<FontAwesomeIcon icon={faMagnifyingGlass} />}
            value={search}
            onChange={(evt) => setSearch(evt.target.value)}
          />
        </div>
        <div className="flex-grow" />
        <div>
          <Button
            variant="outline_bg"
            onClick={onClickListSnapshot}
            leftIcon={<FontAwesomeIcon icon={faCodeCommit} />}
            className="h-10"
            isDisabled={isRollingBack}
          >
            {snapshotCount} Commits
          </Button>
        </div>
        <div>
          <Button
            onClick={onGoBack}
            variant="outline_bg"
            leftIcon={<FontAwesomeIcon icon={faArrowLeft} />}
            className="h-10"
            isDisabled={isRollingBack}
          >
            Go Back
          </Button>
        </div>
        <div>
          <ProjectPermissionCan
            I={ProjectPermissionActions.Create}
            a={ProjectPermissionSub.SecretRollback}
          >
            {(isAllowed) => (
              <Button
                onClick={handleClickRollback}
                isDisabled={isRollingBack || !isAllowed}
                isLoading={isRollingBack}
                leftIcon={<FontAwesomeIcon icon={faUndo} />}
                className="h-10"
              >
                Rollback
              </Button>
            )}
          </ProjectPermissionCan>
        </div>
      </div>
      <div className="mt-4 rounded-md bg-mineshaft-800 text-left text-sm text-bunker-300">
        <div className="flex flex-col ">
          <div className="flex border-b border-mineshaft-600 font-medium">
            <div className="w-12 flex-shrink-0" />
            <div className="w-12 flex-shrink-0" />
            <div className="flex flex-grow items-center px-4 py-2">Changes</div>
          </div>
          {folderDiffView
            .sort((a, b) => a.post.name.toLowerCase().localeCompare(b.post.name.toLowerCase()))
            .filter((a) => a.post.name.toLowerCase().includes(search.toLowerCase()))
            .map(({ mode, pre, post }, index) => (
              <div
                className="group flex cursor-pointer border-b border-mineshaft-600 hover:bg-mineshaft-700"
                key={`folder-${mode}-${index + 1}`}
              >
                <div className="w-12 flex-shrink-0 px-4 py-3">
                  <Tooltip content={mode}>{renderIcon(mode)}</Tooltip>
                </div>
                <div className="w-12 flex-shrink-0 px-4 py-3">
                  <FontAwesomeIcon icon={faFolder} />
                </div>
                <div className="flex flex-grow items-center space-x-4 px-4 py-3">
                  {mode === "modified" ? (
                    <>
                      <div>{pre?.name}</div>
                      <div>
                        <FontAwesomeIcon
                          icon={faChevronRight}
                          size="sm"
                          className="text-orange-700"
                        />
                      </div>
                      <div>{post?.name}</div>
                    </>
                  ) : (
                    post.name
                  )}
                </div>
              </div>
            ))}
          {secretDiffView
            .sort((a, b) => a.post.key.toLowerCase().localeCompare(b.post.key.toLowerCase()))
            .filter((a) => a.post.key.toLowerCase().includes(search.toLowerCase()))
            .map(({ mode, pre, post }, index) => (
              <SecretItem
                key={`folder-${mode}-${index + 1}`}
                mode={mode}
                preSecret={pre}
                postSecret={post}
              />
            ))}
        </div>
      </div>
    </>
  );
};
