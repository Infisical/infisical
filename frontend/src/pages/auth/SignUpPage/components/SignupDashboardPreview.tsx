export const SignupDashboardPreview = () => (
  <div className="pointer-events-none absolute inset-0 overflow-hidden bg-page" aria-hidden="true">
    <img
      alt=""
      src="/images/auth/signup-organization-overview.webp"
      className="h-full w-full scale-[1.01] object-cover object-left opacity-70 blur-[3px]"
      loading="eager"
      decoding="async"
    />
    <div className="absolute inset-0 bg-page/20" />
  </div>
);
