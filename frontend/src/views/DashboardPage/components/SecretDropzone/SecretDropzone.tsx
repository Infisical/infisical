import { ChangeEvent, DragEvent, useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { faClone, faSearch, faUpload } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { yupResolver } from "@hookform/resolvers/yup";
import { twMerge } from "tailwind-merge";
import * as yup from "yup";

import { useNotificationContext } from "@app/components/context/Notifications/NotificationProvider";
// TODO:(akhilmhdh) convert all the util functions like this into a lib folder grouped by functionality
import { parseDotEnv } from "@app/components/utilities/parseDotEnv";
import {
  Button,
  Checkbox,
  FormControl,
  Input,
  Modal,
  ModalContent,
  ModalTrigger,
  Select,
  SelectItem,
  Skeleton
} from "@app/components/v2";
import { useDebounce, usePopUp, useToggle } from "@app/hooks";
import { useGetProjectSecrets } from "@app/hooks/api";
import { UserWsKeyPair } from "@app/hooks/api/types";

const formSchema = yup.object({
  environment: yup.string().required().label("Environment").trim(),
  secretPath: yup
    .string()
    .required()
    .label("Secret Path")
    .trim()
    .transform((val) =>
      typeof val === "string" && val.at(-1) === "/" && val.length > 1 ? val.slice(0, -1) : val
    ),
  secrets: yup.lazy((val) => {
    const valSchema: Record<string, yup.StringSchema> = {};
    Object.keys(val).forEach((key) => {
      valSchema[key] = yup.string().trim();
    });
    return yup.object(valSchema);
  })
});

type TFormSchema = yup.InferType<typeof formSchema>;

const parseJson = (src: ArrayBuffer) => {
  const file = src.toString();
  const formatedData: Record<string, string> = JSON.parse(file);
  const env: Record<string, { value: string; comments: string[] }> = {};
  Object.keys(formatedData).forEach((key) => {
    if (typeof formatedData[key] === "string") {
      env[key] = { value: formatedData[key], comments: [] };
    }
  });
  return env;
};

type Props = {
  isSmaller: boolean;
  onParsedEnv: (env: Record<string, { value: string; comments: string[] }>) => void;
  onAddNewSecret?: () => void;
  environments?: { name: string; slug: string }[];
  workspaceId: string;
  decryptFileKey: UserWsKeyPair;
};

export const SecretDropzone = ({
  isSmaller,
  onParsedEnv,
  onAddNewSecret,
  environments = [],
  workspaceId,
  decryptFileKey
}: Props): JSX.Element => {
  const { t } = useTranslation();
  const [isDragActive, setDragActive] = useToggle();
  const [isLoading, setIsLoading] = useToggle();
  const { createNotification } = useNotificationContext();
  const { popUp, handlePopUpClose, handlePopUpToggle } = usePopUp(["importSecEnv"] as const);
  const [searchFilter, setSearchFilter] = useState("");

  const { handleSubmit, control, watch, register, reset, setValue } = useForm<TFormSchema>({
    resolver: yupResolver(formSchema),
    defaultValues: { secretPath: "/", environment: environments?.[0]?.slug }
  });

  const secretPath = watch("secretPath");
  const selectedEnvSlug = watch("environment");
  const debouncedSecretPath = useDebounce(secretPath);

  const { data: secrets, isLoading: isSecretsLoading } = useGetProjectSecrets({
    workspaceId,
    env: selectedEnvSlug,
    secretPath: debouncedSecretPath,
    isPaused: !(Boolean(workspaceId) && Boolean(selectedEnvSlug) && Boolean(debouncedSecretPath)),
    decryptFileKey
  });

  useEffect(() => {
    setValue("secrets", {});
    setSearchFilter("");
  }, [debouncedSecretPath]);

  const handleDrag = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive.on();
    } else if (e.type === "dragleave") {
      setDragActive.off();
    }
  };

  const parseFile = (file?: File, isJson?: boolean) => {
    const reader = new FileReader();
    if (!file) {
      createNotification({
        text: "You can't inject files from VS Code. Click 'Reveal in finder', and drag your file directly from the directory where it's located.",
        type: "error",
        timeoutMs: 10000
      });
      return;
    }
    // const fileType = file.name.split('.')[1];
    setIsLoading.on();
    reader.onload = (event) => {
      if (!event?.target?.result) return;
      // parse function's argument looks like to be ArrayBuffer
      const env = isJson
        ? parseJson(event.target.result as ArrayBuffer)
        : parseDotEnv(event.target.result as ArrayBuffer);
      setIsLoading.off();
      onParsedEnv(env);
    };

    // If something is wrong show an error
    try {
      reader.readAsText(file);
    } catch (error) {
      console.log(error);
    }
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!e.dataTransfer) {
      return;
    }

    e.dataTransfer.dropEffect = "copy";
    setDragActive.off();
    parseFile(e.dataTransfer.files[0]);
  };

  const handleFileUpload = (e: ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    parseFile(e.target?.files?.[0], e.target?.files?.[0]?.type === "application/json");
  };

  const handleFormSubmit = (data: TFormSchema) => {
    const secretsToBePulled: Record<string, { value: string; comments: string[] }> = {};
    Object.keys(data.secrets || {}).forEach((key) => {
      if (data.secrets[key]) {
        secretsToBePulled[key] = { value: data.secrets[key] || "", comments: [""] };
      }
    });
    onParsedEnv(secretsToBePulled);
    handlePopUpClose("importSecEnv");
    reset();
  };

  return (
    <div
      onDragEnter={handleDrag}
      onDragLeave={handleDrag}
      onDragOver={handleDrag}
      onDrop={handleDrop}
      className={twMerge(
        "relative mx-0.5 mb-4 mt-4 flex cursor-pointer items-center justify-center rounded-md bg-mineshaft-900 py-4 text-sm px-2 text-mineshaft-200 opacity-60 outline-dashed outline-2 outline-chicago-600 duration-200 hover:opacity-100",
        isDragActive && "opacity-100",
        !isSmaller && "w-full max-w-3xl flex-col space-y-4 py-20",
        isLoading && "bg-bunker-800"
      )}
    >
      {isLoading ? (
        <div className="mb-16 flex items-center justify-center pt-16">
          <img src="/images/loading/loading.gif" height={70} width={120} alt="loading animation" />
        </div>
      ) : (
        <form onSubmit={handleSubmit(handleFormSubmit)}>
          <div className="flex items-center justify-cente flex-col space-y-2">
            <div>
              <FontAwesomeIcon icon={faUpload} size={isSmaller ? "2x" : "5x"} />
            </div>
            <div>
              <p className="">{t(isSmaller ? "common.drop-zone-keys" : "common.drop-zone")}</p>
            </div>
            <input
              id="fileSelect"
              type="file"
              className="absolute h-full w-full cursor-pointer opacity-0"
              accept=".txt,.env,.yml,.yaml,.json"
              onChange={handleFileUpload}
            />
            <div className="flex w-full flex-row items-center justify-center py-4">
              <div className="w-1/5 border-t border-mineshaft-700" />
              <p className="mx-4 text-xs text-mineshaft-400">OR</p>
              <div className="w-1/5 border-t border-mineshaft-700" />
            </div>
            <div className="flex items-center justify-center space-x-8">
              <Modal
                isOpen={popUp.importSecEnv.isOpen}
                onOpenChange={(isOpen) => {
                  handlePopUpToggle("importSecEnv", isOpen);
                  reset();
                  setSearchFilter("");
                }}
              >
                <ModalTrigger asChild>
                  <Button variant="star" size={isSmaller ? "xs" : "sm"}>
                    Pull Secrets From An Environment
                  </Button>
                </ModalTrigger>
                <ModalContent
                  className="max-w-2xl"
                  title="Import Secret From An Envronment"
                  subTitle="This can be used to populate your dashboard with secrets from another board"
                >
                  <form>
                    <div className="flex items-center space-x-2">
                      <Controller
                        control={control}
                        name="environment"
                        render={({ field: { value, onChange } }) => (
                          <FormControl label="Environment" isRequired className="w-1/3">
                            <Select
                              value={value}
                              onValueChange={(val) => onChange(val)}
                              className="w-full border border-mineshaft-500"
                              defaultValue={environments?.[0]?.slug}
                              position="popper"
                            >
                              {environments.map((sourceEnvironment) => (
                                <SelectItem
                                  value={sourceEnvironment.slug}
                                  key={`source-environment-${sourceEnvironment.slug}`}
                                >
                                  {sourceEnvironment.name}
                                </SelectItem>
                              ))}
                            </Select>
                          </FormControl>
                        )}
                      />
                      <FormControl label="Secret Path" className="flex-grow" isRequired>
                        <Input
                          {...register("secretPath")}
                          placeholder="Provide a path, default is /"
                        />
                      </FormControl>
                    </div>
                    <div className="border-t border-mineshaft-600 pt-4">
                      <div className="mb-4 flex items-center justify-between">
                        <div>Secrets</div>
                        <div className="w-1/2">
                          <Input
                            placeholder="Search for secret"
                            value={searchFilter}
                            size="xs"
                            leftIcon={<FontAwesomeIcon icon={faSearch} />}
                            onChange={(evt) => setSearchFilter(evt.target.value)}
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4 max-h-64 overflow-auto thin-scrollbar ">
                        {isSecretsLoading &&
                          Array.apply(0, Array(4)).map((_x, i) => (
                            <Skeleton
                              key={`secret-pull-loading-${i + 1}`}
                              className="bg-mineshaft-700"
                            />
                          ))}
                        {secrets?.secrets
                          ?.filter(({ key }) =>
                            key.toLowerCase().includes(searchFilter.toLowerCase())
                          )
                          ?.map(({ _id, key, value: secVal }) => (
                            <Controller
                              key={`pull-secret--${_id}`}
                              control={control}
                              name={`secrets.${key}`}
                              render={({ field: { value, onChange } }) => (
                                <Checkbox
                                  id={`pull-secret-${_id}`}
                                  isChecked={Boolean(value)}
                                  onCheckedChange={(isChecked) => onChange(isChecked ? secVal : "")}
                                >
                                  {key}
                                </Checkbox>
                              )}
                            />
                          ))}
                      </div>
                      <div className="flex items-center space-x-2 mt-8">
                        <Button leftIcon={<FontAwesomeIcon icon={faClone} />} type="submit">
                          Pull Secrets
                        </Button>
                        <Button variant="plain" colorSchema="secondary">
                          Cancel
                        </Button>
                      </div>
                    </div>
                  </form>
                </ModalContent>
              </Modal>
              {!isSmaller && (
                <Button variant="star" onClick={onAddNewSecret}>
                  Add a new secret
                </Button>
              )}
            </div>
          </div>
        </form>
      )}
    </div>
  );
};
