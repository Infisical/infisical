import { useFormContext, useWatch } from "react-hook-form";
import { faCircle, faCircleDot, faShuffle } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import {
  Button,
  Drawer,
  DrawerContent,
  FormControl,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Switch,
  TextArea
} from "@app/components/v2";
import { useToggle } from "@app/hooks";

import { FormData, SecretActionType } from "../../DashboardPage.utils";
import { GenRandomNumber } from "./GenRandomNumber";

type Props = {
  isDrawerOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  index: number;
  isReadOnly?: boolean;
  onEnvCompare: (secretKey: string) => void;
  secretVersion?: Array<{ id: string; createdAt: string; value: string }>;
  // to record the ids of deleted ones
  onSecretDelete: (index: number, secretName: string, id?: string, overrideId?: string) => void;
  onSave: () => void;
};

export const SecretDetailDrawer = ({
  isDrawerOpen,
  onOpenChange,
  index,
  secretVersion = [],
  isReadOnly,
  onSecretDelete,
  onSave,
  onEnvCompare
}: Props): JSX.Element => {
  const [canRevealSecVal, setCanRevealSecVal] = useToggle();
  const [canRevealSecOverride, setCanRevealSecOverride] = useToggle();

  const { register, setValue, control, getValues } = useFormContext<FormData>();

  const overrideAction = useWatch({ control, name: `secrets.${index}.overrideAction` });
  const isOverridden =
    overrideAction === SecretActionType.Created || overrideAction === SecretActionType.Modified;

  const onSecretOverride = () => {
    const secret = getValues(`secrets.${index}`);
    if (isOverridden) {
      // when user created a new override but then removes
      if (SecretActionType.Created) {
        setValue(`secrets.${index}.valueOverride`, "", { shouldDirty: true });
      }
      setValue(`secrets.${index}.overrideAction`, SecretActionType.Deleted, { shouldDirty: true });
    } else {
      setValue(
        `secrets.${index}.overrideAction`,
        secret?.idOverride ? SecretActionType.Modified : SecretActionType.Created,
        { shouldDirty: true }
      );
    }
  };

  return (
    <Drawer onOpenChange={onOpenChange} isOpen={isDrawerOpen}>
      <DrawerContent
        className="dark border-l border-mineshaft-500 bg-bunker"
        title="Secret"
        footerContent={
          <div className="flex flex-col space-y-2 pt-4 shadow-md">
            <div>
              <Button
                variant="star"
                onClick={() => onEnvCompare(getValues(`secrets.${index}.key`))}
                isFullWidth
                isDisabled={isReadOnly}
              >
                Compare secret across environments
              </Button>
            </div>
            <div className="flex w-full space-x-2">
              <Button isFullWidth onClick={onSave} isDisabled={isReadOnly}>
                Save Changes
              </Button>
              <Button
                colorSchema="danger"
                isDisabled={isReadOnly}
                onClick={() => {
                  const secret = getValues(`secrets.${index}`);
                  
                  onSecretDelete(index, secret.key, secret._id, secret.idOverride);
                }}
              >
                Delete
              </Button>
            </div>
          </div>
        }
      >
        <div className="dark:[color-scheme:dark]">
          <FormControl label="Key">
            <Input isDisabled {...register(`secrets.${index}.key`)} />
          </FormControl>
          <FormControl label="Value">
            <Popover>
              <Input
                isReadOnly={isOverridden || isReadOnly}
                {...register(`secrets.${index}.value`)}
                placeholder="EMPTY"
                onBlur={setCanRevealSecVal.off}
                onFocus={setCanRevealSecVal.on}
                type={canRevealSecVal ? "text" : "password"}
                rightIcon={
                  <PopoverTrigger disabled={isOverridden || isReadOnly}>
                    <FontAwesomeIcon icon={faShuffle} />
                  </PopoverTrigger>
                }
              />
              <PopoverContent
                hideCloseBtn
                className="w-auto border-mineshaft-500 bg-bunker p-0"
                align="end"
              >
                <GenRandomNumber
                  onGenerate={(val) =>
                    setValue(`secrets.${index}.value`, val, { shouldDirty: true })
                  }
                />
              </PopoverContent>
            </Popover>
          </FormControl>
          <div className="mb-2 border-t border-mineshaft-600 pt-4">
            <Switch
              id="personal-override"
              onCheckedChange={onSecretOverride}
              isChecked={isOverridden}
              isDisabled={isReadOnly}
            >
              Override with a personal value
            </Switch>
          </div>
          <FormControl>
            <Popover>
              <Input
                isReadOnly={!isOverridden || isReadOnly}
                {...register(`secrets.${index}.valueOverride`)}
                placeholder="EMPTY"
                type={canRevealSecOverride ? "text" : "password"}
                onBlur={setCanRevealSecOverride.off}
                onFocus={setCanRevealSecOverride.on}
                rightIcon={
                  <PopoverTrigger disabled={!isOverridden || isReadOnly}>
                    <FontAwesomeIcon icon={faShuffle} />
                  </PopoverTrigger>
                }
              />
              <PopoverContent
                hideCloseBtn
                className="w-auto border-mineshaft-500 bg-bunker p-0"
                align="end"
              >
                <GenRandomNumber
                  onGenerate={(val) =>
                    setValue(`secrets.${index}.valueOverride`, val, { shouldDirty: true })
                  }
                />
              </PopoverContent>
            </Popover>
          </FormControl>
          <div className="dark mb-4 text-sm text-bunker-300">
            <div className="mb-2">Version History</div>
            <div className="flex h-48 flex-col space-y-2 overflow-y-auto overflow-x-hidden rounded-md border border-mineshaft-600 bg-bunker-800 p-2 dark:[color-scheme:dark]">
              {secretVersion?.map(({ createdAt, value, id }, i) => (
                <div key={id} className="flex flex-col space-y-1">
                  <div className="flex items-center space-x-2">
                    <div>
                      <FontAwesomeIcon icon={i === 0 ? faCircleDot : faCircle} size="sm" />
                    </div>
                    <div>
                      {new Date(createdAt).toLocaleDateString("en-US", {
                        year: "numeric",
                        month: "2-digit",
                        day: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit"
                      })}
                    </div>
                  </div>
                  <div className="ml-1.5 flex items-center space-x-2 border-l border-bunker-300 pl-4">
                    <div className="self-start rounded-sm bg-primary-500/30 px-1">Value:</div>
                    <div className="break-all font-mono">{value}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <FormControl label="Comments & Notes">
            <TextArea
              className="border border-mineshaft-600 text-sm"
              isDisabled={isReadOnly}
              {...register(`secrets.${index}.comment`)}
              rows={5}
            />
          </FormControl>
        </div>
      </DrawerContent>
    </Drawer>
  );
};
