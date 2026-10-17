export function AppLaunch() {
  return <div className="app-loading" role="status" aria-live="polite" aria-label="Loading" aria-busy="true">
    <span className="app-spinner" aria-hidden="true" />
  </div>;
}
