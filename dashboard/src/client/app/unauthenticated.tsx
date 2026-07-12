export function UnauthenticatedExplainer() {
  return (
    <div className="hf-unauth" data-testid="unauthenticated">
      <div className="hf-unauth__card">
        <h1 className="hf-unauth__title">Session token required</h1>
        <p className="hf-unauth__body">
          This dashboard is local-only and expects a one-shot launch token. Open
          it via the CLI so the fragment handshake can store the token.
        </p>
        <code className="hf-unauth__code" data-testid="unauth-relaunch">
          npx hyperflow-dashboard
        </code>
      </div>
    </div>
  );
}
