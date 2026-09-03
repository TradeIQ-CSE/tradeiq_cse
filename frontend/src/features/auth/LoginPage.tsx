// Placeholder for stage 2 (GH #82 / TIQ-89) route wiring only. Stage 3
// replaces this with the real login form (antd Form, INVALID_CREDENTIALS
// handling, redirect to location.state.from).
export function LoginPage() {
  return (
    <div style={{ color: '#e2e8f0', padding: '40px', textAlign: 'center' }}>
      <h1 style={{ fontSize: '24px', fontWeight: 600 }}>Sign in</h1>
      <p style={{ color: '#90a1b9' }}>The sign-in form is not available in the current build.</p>
    </div>
  );
}
