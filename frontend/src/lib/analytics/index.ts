import Telemetry from "@app/components/utilities/telemetry/Telemetry";

import {
  AnalyticsEvent,
  OrganizationAnalyticsEvent,
  OrganizationAnalyticsEventMap
} from "./events";

const telemetry = new Telemetry().getInstance();

export const analytics = {
  captureForOrganization<Event extends OrganizationAnalyticsEvent>(
    event: Event,
    orgId: string,
    properties: OrganizationAnalyticsEventMap[Event]
  ) {
    telemetry.capture(event, {
      ...properties,
      orgId,
      $groups: { organization: orgId }
    });
  }
};

export { AnalyticsEvent };
