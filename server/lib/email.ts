import "dotenv/config";

// Email is sent over Brevo's transactional HTTP API (port 443) rather than SMTP.
// Render's free tier blocks outbound SMTP ports (25/465/587) as of 2025-09-26, so
// a nodemailer connection to smtp.gmail.com hangs until timeout — which made
// better-auth's sendResetPassword (which awaits sendEmail) spin forever. HTTP/443
// is not blocked. Node 22 provides a global fetch, so no dependency is needed.
// The sender must be a verified Brevo sender; SMTP_FROM/SMTP_USER is reused for it.
export const sendEmail = async ({
  to,
  subject,
  html,
}: {
  to: string;
  subject: string;
  html: string;
}) => {
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": process.env.BREVO_API_KEY!,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({
      sender: { email: process.env.SMTP_FROM || process.env.SMTP_USER! },
      to: [{ email: to }],
      subject,
      htmlContent: html,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Brevo send failed: ${res.status} ${body}`);
  }
};
