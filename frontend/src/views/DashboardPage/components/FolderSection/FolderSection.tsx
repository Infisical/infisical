import { faEdit, faFolder, faTrash } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';

import { IconButton, Tooltip } from '@app/components/v2';

type Props = {
  folders?: Array<{ id: string; name: string }>;
  search?: string;
  onFolderUpdate: (folderId: string, name: string) => void;
  onFolderDelete: (folderId: string, name: string) => void;
  onFolderOpen: (folderId: string) => void;
};

export const FolderSection = ({
  onFolderUpdate: handleFolderUpdate,
  onFolderDelete: handleFolderDelete,
  onFolderOpen: handleFolderOpen,
  search = '',
  folders = []
}: Props) => {
  return (
    <>
      {folders
        .filter(({ name }) => name.toLowerCase().includes(search.toLowerCase()))
        .map(({ id, name }) => (
          <tr key={id} className="group flex flex-row items-center">
            <td className="flex h-10 w-10 items-center justify-center border-none px-4">
              <FontAwesomeIcon icon={faFolder} className="text-primary-700" />
            </td>
            <td
              colSpan={2}
              className="relative flex w-full min-w-[220px] items-center justify-between overflow-hidden text-ellipsis uppercase lg:min-w-[240px] xl:min-w-[280px]"
              style={{ paddingTop: '0', paddingBottom: '0' }}
            >
              <div
                className="flex-grow cursor-pointer p-2 pl-3"
                onKeyDown={() => null}
                tabIndex={0}
                role="button"
                onClick={() => handleFolderOpen(id)}
              >
                {name}
              </div>
              <div className="duration-0 flex h-10 w-16 items-center justify-end space-x-2.5 overflow-hidden border-l border-mineshaft-600 transition-all">
                <div className="opacity-0 group-hover:opacity-100">
                  <Tooltip content="Settings">
                    <IconButton
                      size="lg"
                      colorSchema="primary"
                      variant="plain"
                      onClick={() => handleFolderUpdate(id, name)}
                      ariaLabel="expand"
                    >
                      <FontAwesomeIcon icon={faEdit} />
                    </IconButton>
                  </Tooltip>
                </div>
                <div className="opacity-0 group-hover:opacity-100">
                  <Tooltip content="Delete">
                    <IconButton
                      size="md"
                      variant="plain"
                      colorSchema="danger"
                      ariaLabel="delete"
                      onClick={() => handleFolderDelete(id, name)}
                    >
                      <FontAwesomeIcon icon={faTrash} />
                    </IconButton>
                  </Tooltip>
                </div>
              </div>
            </td>
          </tr>
        ))}
    </>
  );
};
