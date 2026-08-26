import styles from "../admin.module.css";

export default function SetupRequiredPage() {
  return <main className={styles.setup}><span className={styles.badge}>Setup required</span><h1>Connect administrator sign-in</h1><p>Admin access is closed until Cognito, an administrator group, and a strong session secret are configured. No authentication bypass is enabled automatically.</p><code>COGNITO_ISSUER<br />COGNITO_CLIENT_ID<br />COGNITO_DOMAIN<br />COGNITO_ADMIN_GROUP<br />COGNITO_REDIRECT_URI<br />COGNITO_LOGOUT_REDIRECT_URI<br />SESSION_SECRET (32+ characters)</code></main>;
}
