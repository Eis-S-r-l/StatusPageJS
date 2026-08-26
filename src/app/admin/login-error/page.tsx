import styles from "../admin.module.css";

export default function LoginErrorPage() { return <main className={styles.setup}><h1>Sign-in was not completed</h1><p>The request was rejected, expired, or your account is not in the permitted Cognito administrator group. No administrator session was created.</p><form action="/api/auth/login" method="get"><button className={styles.button} type="submit">Try again</button></form></main>; }
