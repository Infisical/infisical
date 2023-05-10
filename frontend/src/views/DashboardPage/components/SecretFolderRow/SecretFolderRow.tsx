/* eslint-disable react/jsx-no-useless-fragment */
import { memo, useRef } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { useRouter } from 'next/router';
import {
  faFolder,
  faPencil,
  faXmark
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';

import {
  IconButton,
  Tooltip
} from '@app/components/v2';

import { FormData } from '../../DashboardPage.utils';

type Props = {
  index: number;
  _id: string;
  // permission and external state's that decided to hide or show
  isReadOnly?: boolean;
  isAddOnly?: boolean;
  isRollbackMode?: boolean;
  searchTerm: string;
  // to record the ids of deleted ones
  onFolderDelete: (index: number, id?: string, overrideId?: string) => void;
  // sidebar control props
  handlePopUpOpen: (popUpName: "createUpdateFolder", data: any) => void;
  name: string;
  reset: any;
};


export const SecretFolderRow = memo(
  ({
    index,
    _id,
    handlePopUpOpen,
    isReadOnly,
    isRollbackMode,
    isAddOnly,
    onFolderDelete,
    searchTerm,
    name,
    reset
  }: Props): JSX.Element => {
    const isKeySubDisabled = useRef<boolean>(false);
    const { 
      // register, setValue, 
      control } = useFormContext<FormData>();
    console.log(123, _id, name)
    const router = useRouter();

    // to get details on a secret
    // const overrideAction = useWatch({ control, name: `secrets.${index}.overrideAction` });
    const idOverride = useWatch({ control, name: `secrets.${index}.idOverride` });
    const secComment = useWatch({ control, name: `secrets.${index}.comment` });
    const secKey = useWatch({
      control,
      name: `secrets.${index}.key`,
      disabled: isKeySubDisabled.current
    });
    const secId = useWatch({ control, name: `secrets.${index}._id` });

    const tags = useWatch({ control, name: `secrets.${index}.tags`, defaultValue: [] }) || [];
    // const selectedTagIds = tags.reduce<Record<string, boolean>>(
    //   (prev, curr) => ({ ...prev, [curr.slug]: true }),
    //   {}
    // );

    // const isCreatedSecret = !secId;
    // const shouldBeBlockedInAddOnly = !isCreatedSecret && isAddOnly;

    // Why this instead of filter in parent
    // Because rhf field.map has default values so basically
    // keys are not updated there and index needs to kept so that we can monitor
    // values individually here
    if (
      !(
        secKey?.toUpperCase().includes(searchTerm?.toUpperCase()) ||
        tags
          ?.map((tag) => tag.name)
          .join(' ')
          ?.toUpperCase()
          .includes(searchTerm?.toUpperCase()) ||
        secComment?.toUpperCase().includes(searchTerm?.toUpperCase())
      )
    ) {
      return <></>;
    }

    return (
      <tr 
        className="group flex flex-row items-center cursor-default hover:bg-mineshaft-700" 
        key={index}
      >
        <td className="flex h-10 w-10 items-center justify-center px-4 border-none">
          {/* <div className="w-10 text-center text-xs text-bunker-400">{index + 1}</div> */}
          <div className="w-10 text-center text-xs"><FontAwesomeIcon icon={faFolder} className="w-4 h-4 text-yellow-400/50 pl-2.5 pt-0.5" /></div>
        </td>
        <button 
          type="button"
          className="w-full border-none ml-2.5 text-left cursor-default" 
          onClick={async () => {
            await router.push({
              pathname: router.pathname,
              query: { ...router.query, folder: _id }
            })
            router.reload();
          }}
        >{name}</button>
        <td className="min-w-sm flex h-10 items-center">
          <div className="duration-0 ml-auto w-0 flex items-center justify-end space-x-2.5 overflow-hidden transition-all w-16 border-l border-mineshaft-600 h-10">
            {!isAddOnly && (
              <div className="opacity-0 group-hover:opacity-100">
                <Tooltip content="Settings" className="z-50">
                  <IconButton
                    size="md"
                    colorSchema="primary"
                    variant="plain"
                    onClick={() => {
                      console.log(888, {id: _id, name})
                      handlePopUpOpen('createUpdateFolder', {id: _id, name});
                      reset({id: _id, name});
                    }}
                    ariaLabel="expand"
                  >
                    <FontAwesomeIcon icon={faPencil} />
                  </IconButton>
                </Tooltip>
              </div>
            )}
            <div className="opacity-0 group-hover:opacity-100">
              <Tooltip content="Delete" className="z-50">
                <IconButton
                  size="md"
                  variant="plain"
                  colorSchema="danger"
                  ariaLabel="delete"
                  isDisabled={isReadOnly || isRollbackMode}
                  onClick={() => onFolderDelete(index, secId, idOverride)}
                >
                  <FontAwesomeIcon icon={faXmark} />
                </IconButton>
              </Tooltip>
            </div>
          </div>
        </td>
      </tr>
    );
  }
);

SecretFolderRow.displayName = 'SecretFolderRow';
