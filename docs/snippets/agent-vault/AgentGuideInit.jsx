export const AgentGuideInit = ({ agent }) => {
  if (typeof window !== "undefined") {
    const params = new URLSearchParams(window.location.search);
    if (params.get("agent") !== agent) {
      params.set("agent", agent);
      const query = params.toString();
      const next = `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`;
      window.history.replaceState({}, "", next);
      window.dispatchEvent(new Event("av-quickstart-selection-change"));
    }
  }
  return null;
};
