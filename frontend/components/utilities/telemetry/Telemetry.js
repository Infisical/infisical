/* eslint-disable */
import { initPostHog } from "~/components/analytics/posthog";
import { ENV } from "~/components/utilities/config";

class Capturer {
  constructor() {
      this.api = initPostHog();
  }

  capture(item) {
    if (ENV == "production" && TELEMETRY_CAPTURING_ENABLED) {
      try {
        this.api.capture(item);
      } catch (error) {
        console.error("PostHog", error);
      }
    }
  }

  identify(id) {
    if (ENV == "production" && TELEMETRY_CAPTURING_ENABLED) {
      try {
        this.api.identify(id);
      } catch (error) {
        console.error("PostHog", error);
      }
    }
  }

}

export default class Telemetry {
  constructor() {
      if (!Telemetry.instance) {
        Telemetry.instance = new Capturer();
      }
  }

  getInstance() {
      return Telemetry.instance;
  }
}
