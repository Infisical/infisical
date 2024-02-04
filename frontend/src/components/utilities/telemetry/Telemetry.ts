/* eslint-disable */
import { PostHog } from 'posthog-js';
import { initPostHog } from '@app/components/analytics/posthog';
import { ENV } from '@app/components/utilities/config';

declare let TELEMETRY_CAPTURING_ENABLED: any;

class Capturer {
  api: PostHog;

  constructor() {
    this.api = initPostHog()!;
  }

  capture(item: string) {
    if (ENV === 'production' && TELEMETRY_CAPTURING_ENABLED === "true") {
      try {
        this.api.capture(item);
      } catch (error) {
        console.error('PostHog', error);
      }
    }
  }

  identify(id: string, email?: string) {
    if (ENV === 'production' && TELEMETRY_CAPTURING_ENABLED === "true") {
      try {
        this.api.identify(id, {
          email: email
        });
      } catch (error) {
        console.error('PostHog', error);
      }
    }
  }
}

export default class Telemetry {
  static instance: Capturer;

  constructor() {
    if (!Telemetry.instance) {
      Telemetry.instance = new Capturer();
    }
  }

  getInstance() {
    return Telemetry.instance;
  }
}
