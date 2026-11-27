import { createContext, useContext } from "react";
import { FieldErrors, get } from "react-hook-form";

import { TChannelsForm } from "@app/hooks/api/alerts";

// The form field ChannelsField binds its channel list to. A form can hold more than one list, eg one per
// alert, so the fields under it build their paths from this instead of assuming `channels`.
const ChannelsFieldNameContext = createContext("channels");

export const ChannelsFieldNameProvider = ChannelsFieldNameContext.Provider;

// Typed as the root `channels` array so react-hook-form still checks the rest of each path; the list keeps
// the TChannelsForm shape wherever it sits in the form.
export const useChannelsFieldName = () => useContext(ChannelsFieldNameContext) as "channels";

export const useChannelPath = (index: number) =>
  `${useChannelsFieldName()}.${index}` as `channels.${number}`;

export type TChannelErrors = NonNullable<FieldErrors<TChannelsForm>["channels"]>[number];

export const getChannelErrors = (errors: FieldErrors<TChannelsForm>, channelPath: string) =>
  get(errors, channelPath) as TChannelErrors | undefined;
