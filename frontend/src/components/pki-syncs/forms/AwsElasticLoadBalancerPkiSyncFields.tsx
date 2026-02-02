import { useEffect, useRef } from "react";
import { Controller, useFieldArray, useFormContext } from "react-hook-form";

import { Checkbox, FormControl, FormLabel, Select, SelectItem, Spinner } from "@app/components/v2";
import { AWS_REGIONS } from "@app/helpers/appConnections";
import {
  PkiSync,
  TAwsListener,
  useListAwsListeners,
  useListAwsLoadBalancers
} from "@app/hooks/api/pkiSyncs";

import { TPkiSyncForm } from "./schemas/pki-sync-schema";
import { PkiSyncConnectionField } from "./PkiSyncConnectionField";

type TAwsElasticLoadBalancerForm = TPkiSyncForm & { destination: PkiSync.AwsElasticLoadBalancer };

const ListenersLoadingState = () => (
  <div className="flex items-center justify-center py-4">
    <Spinner size="sm" />
    <span className="ml-2 text-sm text-mineshaft-400">Loading listeners...</span>
  </div>
);

const NoListenersState = () => (
  <div className="rounded-md border border-mineshaft-600 bg-mineshaft-900 p-4 text-center text-sm text-mineshaft-400">
    No HTTPS/TLS listeners found for this load balancer.
  </div>
);

type ListenerItemProps = {
  listener: TAwsListener;
  isSelected: boolean;
  onToggle: (listener: TAwsListener, checked: boolean) => void;
};

const ListenerItem = ({ listener, isSelected, onToggle }: ListenerItemProps) => (
  <div
    key={listener.listenerArn}
    className="flex items-center justify-between rounded-md border border-mineshaft-600 bg-mineshaft-800 p-3"
  >
    <div className="flex items-center gap-3">
      <Checkbox
        id={`listener-${listener.listenerArn}`}
        isChecked={isSelected}
        onCheckedChange={(checked) => onToggle(listener, checked === true)}
      />
      <div>
        <FormLabel
          label={`Port ${listener.port} (${listener.protocol})`}
          className="mb-0 cursor-pointer text-sm font-medium text-mineshaft-100"
        />
        {listener.sslPolicy && (
          <p className="text-xs text-mineshaft-400">SSL Policy: {listener.sslPolicy}</p>
        )}
      </div>
    </div>
  </div>
);

export const AwsElasticLoadBalancerPkiSyncFields = () => {
  const { control, watch, setValue } = useFormContext<TAwsElasticLoadBalancerForm>();

  const connectionId = watch("connection.id");
  const region = watch("destinationConfig.region");
  const loadBalancerArn = watch("destinationConfig.loadBalancerArn");

  const isInitialMount = useRef(true);
  const previousRegion = useRef(region);
  const previousLoadBalancerArn = useRef(loadBalancerArn);

  const { fields, replace } = useFieldArray({
    control,
    name: "destinationConfig.listeners"
  });

  const { data: loadBalancers, isLoading: isLoadingLoadBalancers } = useListAwsLoadBalancers(
    { connectionId, region },
    { enabled: !!connectionId && !!region }
  );

  const { data: listeners, isLoading: isLoadingListeners } = useListAwsListeners(
    { connectionId, region, loadBalancerArn },
    { enabled: !!connectionId && !!region && !!loadBalancerArn }
  );

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      previousRegion.current = region;
      previousLoadBalancerArn.current = loadBalancerArn;
      return;
    }

    if (region && previousRegion.current && region !== previousRegion.current) {
      setValue("destinationConfig.loadBalancerArn", "");
      replace([]);
    }
    previousRegion.current = region;
  }, [region, setValue, replace]);

  useEffect(() => {
    if (!loadBalancerArn || !listeners || listeners.length === 0) {
      return;
    }

    if (previousLoadBalancerArn.current && loadBalancerArn !== previousLoadBalancerArn.current) {
      const defaultListeners = listeners.map((listener) => ({
        listenerArn: listener.listenerArn,
        port: listener.port,
        protocol: listener.protocol
      }));
      replace(defaultListeners);
      previousLoadBalancerArn.current = loadBalancerArn;
      return;
    }

    previousLoadBalancerArn.current = loadBalancerArn;

    const currentListeners = fields;
    const hasValidListeners =
      currentListeners.length > 0 &&
      currentListeners.some((l) =>
        listeners.some((apiListener) => apiListener.listenerArn === l.listenerArn)
      );

    if (!hasValidListeners) {
      const defaultListeners = listeners.map((listener) => ({
        listenerArn: listener.listenerArn,
        port: listener.port,
        protocol: listener.protocol
      }));
      replace(defaultListeners);
    }
  }, [listeners, loadBalancerArn, fields, replace]);

  const handleListenerToggle = (listener: TAwsListener, checked: boolean) => {
    const currentListeners = fields;

    if (checked) {
      const newListeners = [
        ...currentListeners,
        {
          listenerArn: listener.listenerArn,
          port: listener.port,
          protocol: listener.protocol
        }
      ];
      replace(newListeners);
    } else {
      const newListeners = currentListeners.filter((l) => l.listenerArn !== listener.listenerArn);
      replace(newListeners);
    }
  };

  const selectedListenerArns = new Set(fields.map((l) => l.listenerArn));

  const renderListenersContent = () => {
    if (isLoadingListeners) {
      return <ListenersLoadingState />;
    }

    if (!listeners || listeners.length === 0) {
      return <NoListenersState />;
    }

    return (
      <div className="space-y-3 rounded-md border border-mineshaft-600 bg-mineshaft-900 p-4">
        {listeners.map((listener) => {
          const isSelected = selectedListenerArns.has(listener.listenerArn);

          return (
            <ListenerItem
              key={listener.listenerArn}
              listener={listener}
              isSelected={isSelected}
              onToggle={handleListenerToggle}
            />
          );
        })}
      </div>
    );
  };

  return (
    <>
      <PkiSyncConnectionField
        onChange={() => {
          setValue("destinationConfig.region", "");
          setValue("destinationConfig.loadBalancerArn", "");
          replace([]);
        }}
      />

      <Controller
        name="destinationConfig.region"
        control={control}
        render={({ field, fieldState: { error } }) => (
          <FormControl
            isError={Boolean(error)}
            errorText={error?.message}
            label="AWS Region"
            tooltipText="Select the AWS region where your Elastic Load Balancers are located."
          >
            <Select
              value={field.value}
              onValueChange={(value) => {
                field.onChange(value);
              }}
              className="w-full border border-mineshaft-500 capitalize"
              position="popper"
              placeholder="Select an AWS region"
              isDisabled={!connectionId}
            >
              {AWS_REGIONS.map(({ name, slug }) => (
                <SelectItem value={slug} key={slug}>
                  {name}
                </SelectItem>
              ))}
            </Select>
          </FormControl>
        )}
      />

      <Controller
        name="destinationConfig.loadBalancerArn"
        control={control}
        render={({ field, fieldState: { error } }) => (
          <FormControl
            isError={Boolean(error)}
            errorText={error?.message}
            label="Load Balancer"
            tooltipText="Select the Application or Network Load Balancer to deploy certificates to."
          >
            {isLoadingLoadBalancers ? (
              <div className="flex items-center justify-center py-4">
                <Spinner size="sm" />
                <span className="ml-2 text-sm text-mineshaft-400">Loading load balancers...</span>
              </div>
            ) : (
              <Select
                value={field.value}
                onValueChange={(value) => {
                  field.onChange(value);
                  replace([]);
                }}
                className="w-full border border-mineshaft-500"
                position="popper"
                placeholder="Select a load balancer"
                isDisabled={!connectionId || !region}
              >
                {loadBalancers?.map((lb) => (
                  <SelectItem value={lb.loadBalancerArn} key={lb.loadBalancerArn}>
                    {lb.loadBalancerName}
                  </SelectItem>
                ))}
              </Select>
            )}
          </FormControl>
        )}
      />

      {loadBalancerArn && (
        <Controller
          name="destinationConfig.listeners"
          control={control}
          render={({ fieldState: { error } }) => (
            <FormControl
              isError={Boolean(error)}
              errorText={error?.message}
              label="HTTPS/TLS Listeners"
              tooltipText="Select which listeners should receive the certificate. You can set a default certificate from the certificates table after creating the sync."
            >
              {renderListenersContent()}
            </FormControl>
          )}
        />
      )}
    </>
  );
};
