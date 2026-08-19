import { faWrench } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { Spinner, Tooltip } from "@app/components/v2";
import { SECRET_SCANNING_DATA_SOURCE_MAP } from "@app/helpers/secretScanningV2";
import {
  SecretScanningDataSource,
  useSecretScanningDataSourceOptions
} from "@app/hooks/api/secretScanningV2";

type Props = {
  onSelect: (type: SecretScanningDataSource) => void;
};

export const SecretScanningDataSourceSelect = ({ onSelect }: Props) => {
  const { isPending, data: dataSourceOptions } = useSecretScanningDataSourceOptions();

  if (isPending) {
    return (
      <div className="flex h-full flex-col items-center justify-center py-2.5">
        <Spinner size="lg" className="text-muted" />
        <p className="mt-4 text-sm text-muted">Loading options...</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-3 gap-2">
      {dataSourceOptions?.map(({ type }) => {
        const { image, name, size } = SECRET_SCANNING_DATA_SOURCE_MAP[type];

        return (
          <button
            type="button"
            key={type}
            onClick={() => onSelect(type)}
            className="group relative flex h-28 cursor-pointer flex-col items-center justify-center rounded-md border border-border bg-container-hover p-4 duration-200 hover:bg-foreground/10"
          >
            <img
              src={`/images/integrations/${image}`}
              width={size}
              className="mt-auto"
              alt={`${name} logo`}
            />
            <div className="mt-auto max-w-xs text-center text-xs font-medium text-label duration-200 group-hover:text-foreground">
              {name}
            </div>
          </button>
        );
      })}
      <Tooltip
        side="bottom"
        className="max-w-sm py-4"
        content={
          <>
            <p className="mb-2">Infisical is constantly adding support for more services.</p>
            <p>
              {`If you don't see the third-party
            service you're looking for,`}{" "}
              <a
                target="_blank"
                className="underline hover:text-label"
                href="https://infisical.com/slack"
                rel="noopener noreferrer"
              >
                let us know on Slack
              </a>{" "}
              or{" "}
              <a
                target="_blank"
                className="underline hover:text-label"
                href="https://github.com/Infisical/infisical/discussions"
                rel="noopener noreferrer"
              >
                make a request on GitHub
              </a>
              .
            </p>
          </>
        }
      >
        <div className="group relative flex h-28 flex-col items-center justify-center rounded-md border border-dashed border-border bg-container p-4 hover:bg-card/50">
          <FontAwesomeIcon className="mt-auto text-3xl" icon={faWrench} />
          <div className="mt-auto max-w-xs text-center text-xs font-medium text-label duration-200 group-hover:text-foreground">
            Coming Soon
          </div>
        </div>
      </Tooltip>
    </div>
  );
};
