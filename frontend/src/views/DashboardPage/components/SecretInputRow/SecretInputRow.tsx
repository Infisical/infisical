/* eslint-disable react/jsx-no-useless-fragment */
import { Controller, useFieldArray, useFormContext, useWatch } from 'react-hook-form';
import {
  faCodeBranch,
  faComment,
  faEllipsis,
  faInfoCircle,
  faPlus,
  faSquare,
  faSquareCheck,
  faTags,
  faTrash
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { cx } from 'cva';
import { twMerge } from 'tailwind-merge';

import {
  Button,
  FormControl,
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
  IconButton,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Tag,
  TextArea,
  Tooltip
} from '@app/components/v2';
import { useToggle } from '@app/hooks';
import { WsTag } from '@app/hooks/api/types';

import { FormData, SecretActionType } from '../../DashboardPage.utils';

type Props = {
  index: number;
  // permission and external state's that decided to hide or show
  isReadOnly?: boolean;
  isAddOnly?: boolean;
  isRollbackMode?: boolean;
  isSecretValueHidden: boolean;
  searchTerm: string;
  // to record the ids of deleted ones
  onSecretDelete: (index: number, id?: string, overrideId?: string) => void;
  // sidebar control props
  onRowExpand: () => void;
  // tag props
  wsTags?: WsTag[];
  onCreateTagOpen: () => void;
};

const tagColors = [
  { bg: 'bg-[#f1c40f]/40', text: 'text-[#fcf0c3]/70' },
  { bg: 'bg-[#cb1c8d]/40', text: 'text-[#f2c6e3]/70' },
  { bg: 'bg-[#badc58]/40', text: 'text-[#eef6d5]/70' },
  { bg: 'bg-[#ff5400]/40', text: 'text-[#ffddcc]/70' },
  { bg: 'bg-[#3AB0FF]/40', text: 'text-[#f0fffd]/70' },
  { bg: 'bg-[#6F1AB6]/40', text: 'text-[#FFE5F1]/70' },
  { bg: 'bg-[#C40B13]/40', text: 'text-[#FFDEDE]/70' },
  { bg: 'bg-[#332FD0]/40', text: 'text-[#DFF6FF]/70' }
];

export const SecretInputRow = ({
  index,
  isSecretValueHidden,
  onRowExpand,
  isReadOnly,
  isRollbackMode,
  isAddOnly,
  wsTags,
  onCreateTagOpen,
  onSecretDelete,
  searchTerm
}: Props): JSX.Element => {
  const { register, setValue, control } = useFormContext<FormData>();
  const [canRevealSecret, setCanRevealSecret] = useToggle();
  // comment management in a row
  const {
    fields: secretTags,
    remove,
    append
  } = useFieldArray({ control, name: `secrets.${index}.tags` });

  // to get details on a secret
  const secret = useWatch({ name: `secrets.${index}`, control });

  const hasComment = Boolean(secret.comment);
  const tags = secret.tags || [];
  const selectedTagIds = tags.reduce<Record<string, boolean>>(
    (prev, curr) => ({ ...prev, [curr.slug]: true }),
    {}
  );

  // when secret is override by personal values
  const isOverridden =
    secret.overrideAction === SecretActionType.Created ||
    secret.overrideAction === SecretActionType.Modified;

  const onSecretOverride = () => {
    if (isOverridden) {
      // when user created a new override but then removes
      if (secret?.overrideAction === SecretActionType.Created)
        setValue(`secrets.${index}.valueOverride`, '');
      setValue(`secrets.${index}.overrideAction`, SecretActionType.Deleted, { shouldDirty: true });
    } else {
      setValue(
        `secrets.${index}.overrideAction`,
        secret?.idOverride ? SecretActionType.Modified : SecretActionType.Created,
        { shouldDirty: true }
      );
    }
  };

  const onSelectTag = (selectedTag: WsTag) => {
    const shouldAppend = !selectedTagIds[selectedTag.slug];
    if (shouldAppend) {
      append(selectedTag);
    } else {
      const pos = tags.findIndex(({ slug }) => selectedTag.slug === slug);
      remove(pos);
    }
  };

  const isCreatedSecret = !secret?._id;
  const shouldBeBlockedInAddOnly = !isCreatedSecret && isAddOnly;

  // Why this instead of filter in parent
  // Because rhf field.map has default values so basically
  // keys are not updated there and index needs to kept so that we can monitor
  // values individually here
  if (
    !(
      secret.key?.toUpperCase().includes(searchTerm?.toUpperCase()) ||
      tags
        ?.map((tag) => tag.name)
        .join(' ')
        ?.toUpperCase()
        .includes(searchTerm?.toUpperCase()) ||
      secret.comment?.toUpperCase().includes(searchTerm?.toUpperCase())
    )
  ) {
    return <></>;
  }

  return (
    <tr className="group min-w-full flex flex-row">
      <td className="w-10 px-4 flex items-center justify-center"><div className='text-center text-xs text-bunker-400'>{index + 1}</div></td>
      <Controller
        control={control}
        defaultValue=""
        name={`secrets.${index}.key`}
        render={({ fieldState: { error }, field }) => (
          <HoverCard openDelay={0} open={error?.message ? undefined : false}>
            <HoverCardTrigger asChild>
              <td className={cx(error?.message ? 'rounded ring ring-red/50' : null)}>
                <div className="min-w-[220px] relative flex items-center">
                  <Input
                    autoComplete="off"
                    variant="plain"
                    isDisabled={isReadOnly || shouldBeBlockedInAddOnly || isRollbackMode}
                    className="w-full text-ellipsis font-mono focus:text-bunker-100 focus:ring-transparent"
                    {...field}
                  />
                  {!isAddOnly && (
                    <IconButton
                      variant="plain"
                      className={twMerge(
                        'w-0 overflow-hidden p-0 group-hover:w-6',
                        isOverridden && 'w-6 text-primary'
                      )}
                      onClick={onSecretOverride}
                      isDisabled={isRollbackMode || isReadOnly}
                      ariaLabel="info"
                    >
                      <div className="flex items-center space-x-1">
                        <FontAwesomeIcon icon={faCodeBranch} className="text-base" />
                      </div>
                    </IconButton>
                  )}
                </div>
              </td>
            </HoverCardTrigger>
            <HoverCardContent className="w-auto py-2 pt-2">
              <div className="flex items-center space-x-2">
                <div>
                  <FontAwesomeIcon icon={faInfoCircle} className="text-red" />
                </div>
                <div className="text-sm">{error?.message}</div>
              </div>
            </HoverCardContent>
          </HoverCard>
        )}
      />
      <div className="flex-grow w-full">
        {!isOverridden && (
          <Input
            variant="plain"
            isReadOnly={isReadOnly || shouldBeBlockedInAddOnly || isRollbackMode}
            className="w-full text-ellipsis font-mono focus:text-bunker-100 focus:ring-transparent"
            type={canRevealSecret || isSecretValueHidden ? 'text' : 'password'}
            {...register(`secrets.${index}.value`)}
            placeholder="EMPTY"
            onBlur={setCanRevealSecret.off}
            onFocus={setCanRevealSecret.on}
            autoComplete="off"
          />
        )}
        {isOverridden && (
          <Input
            variant="plain"
            isReadOnly={isReadOnly || isAddOnly || isRollbackMode}
            className="w-full text-ellipsis font-mono focus:text-bunker-100 focus:ring-transparent"
            type={canRevealSecret || isSecretValueHidden ? 'text' : 'password'}
            placeholder="EMPTY"
            {...register(`secrets.${index}.valueOverride`)}
            onBlur={setCanRevealSecret.off}
            onFocus={setCanRevealSecret.on}
            autoComplete="off"
          />
        )}
      </div>
      <td className="flex items-center min-w-sm">
        <div className="flex items-center group-hover:mr-0 group-hover:border-r group-hover:border-mineshaft-600">
          {secretTags.map(({ id, slug }, i) => (
            <Tag
              className={cx(
                tagColors[i % tagColors.length].bg,
                tagColors[i % tagColors.length].text
              )}
              isDisabled={isReadOnly || isAddOnly || isRollbackMode}
              onClose={() => remove(i)}
              key={id}
            >
              {slug}
            </Tag>
          ))}
          {!(isReadOnly || isAddOnly || isRollbackMode) && (
            <div className="w-0 overflow-hidden group-hover:w-8">
              <Popover>
                <PopoverTrigger asChild>
                  <div>
                    <Tooltip content="Add tag">
                      <IconButton variant="star" size="xs" ariaLabel="add-tag">
                        <FontAwesomeIcon icon={faTags} />
                      </IconButton>
                    </Tooltip>
                  </div>
                </PopoverTrigger>
                <PopoverContent
                  side="left"
                  className="max-h-96 w-auto min-w-[240px] overflow-y-auto overflow-x-hidden p-2 text-bunker-100"
                  hideCloseBtn
                >
                  <div className="mb-2 text-sm font-medium">Add tags to this secret</div>
                  <div className="flex flex-col space-y-1">
                    {wsTags?.map((wsTag) => (
                      <Button
                        variant="plain"
                        size="sm"
                        isFullWidth
                        className={twMerge(
                          'justify-start bg-mineshaft-800 text-bunker-100',
                          selectedTagIds?.[wsTag.slug] && 'text-primary'
                        )}
                        onClick={() => onSelectTag(wsTag)}
                        leftIcon={
                          <FontAwesomeIcon
                            icon={selectedTagIds?.[wsTag.slug] ? faSquareCheck : faSquare}
                          />
                        }
                        key={wsTag._id}
                      >
                        {wsTag.slug}
                      </Button>
                    ))}
                    <Button
                      variant="plain"
                      size="sm"
                      isFullWidth
                      className="mt-4 justify-start bg-mineshaft-800 text-bunker-400 hover:text-primary"
                      onClick={onCreateTagOpen}
                      leftIcon={<FontAwesomeIcon icon={faPlus} />}
                    >
                      Add new tag
                    </Button>
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          )}
        </div>
        <div className={`${hasComment ? "w-8" : "w-0"} overflow-hidden group-hover:w-8`}>
          <Popover>
            <PopoverTrigger asChild>
              <IconButton variant="star" size="xs" ariaLabel="add-tag">
                <FontAwesomeIcon icon={faComment} />
              </IconButton>
            </PopoverTrigger>
            <PopoverContent className="w-auto">
              <FormControl label="Comment" className="mb-0">
                <TextArea
                  isDisabled={isReadOnly || isRollbackMode || shouldBeBlockedInAddOnly}
                  {...register(`secrets.${index}.comment`)}
                  rows={8}
                  cols={30}
                />
              </FormControl>
            </PopoverContent>
          </Popover>
        </div>
        <div className="flex w-0 items-center justify-end space-x-2 overflow-hidden transition-all group-hover:w-16">
          <Tooltip content="delete">
            <IconButton
              size="xs"
              colorSchema="danger"
              ariaLabel="delete"
              isDisabled={isReadOnly || isRollbackMode}
              onClick={() => onSecretDelete(index, secret._id, secret?.idOverride)}
            >
              <FontAwesomeIcon icon={faTrash} />
            </IconButton>
          </Tooltip>
          {!isAddOnly && (
            <Tooltip content="more">
              <IconButton size="xs" variant="solid" onClick={onRowExpand} ariaLabel="expand">
                <FontAwesomeIcon icon={faEllipsis} />
              </IconButton>
            </Tooltip>
          )}
        </div>
      </td>
    </tr>
  );
};
