import Telemetry from "@app/components/utilities/telemetry/Telemetry";

import {
  AnalyticsEvent,
  OrganizationAnalyticsEvent,
  OrganizationAnalyticsEventMap,
  ThemePreferenceChangedProperties
} from "./events";

export const analytics = {
  captureThemePreferenceChanged(properties: ThemePreferenceChangedProperties) {
    const telemetry = new Telemetry().getInstance();
    telemetry.capture(AnalyticsEvent.ThemePreferenceChanged, properties);
  },
  captureForOrganization<Event extends OrganizationAnalyticsEvent>(
    event: Event,
    orgId: string,
    properties: OrganizationAnalyticsEventMap[Event]
  ) {
    const telemetry = new Telemetry().getInstance();
    telemetry.capture(event, {
      ...properties,
      orgId,
      $groups: { organization: orgId }
    });
  }
};

export { AnalyticsEvent };
export type {
  FolderAccessGrantSheetSource,
  SecretsAddResourceAction,
  SecretsAddResourceMenuLevel,
  SecretsAddResourceMenuSource
} from "./events";
