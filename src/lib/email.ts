export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
}

export type EmailSendResult =
  | { sent: true; provider: "http" }
  | { sent: false; reason: "email not configured" | "email provider error"; status?: number };

function readEnv(name: string) {
  const value = process.env[name]?.trim();
  return value && value.length > 0 ? value : undefined;
}

function logEmailFallback(message: EmailMessage) {
  console.log(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      severity: "info",
      route: "email",
      message: "email not configured",
      to: message.to,
      subject: message.subject,
    }),
  );
}

export async function sendEmail(message: EmailMessage): Promise<EmailSendResult> {
  const providerUrl = readEnv("EMAIL_PROVIDER_URL");
  if (!providerUrl) {
    logEmailFallback(message);
    return { sent: false, reason: "email not configured" };
  }

  const from = readEnv("EMAIL_FROM") ?? "no-reply@example.edu";
  const token = readEnv("EMAIL_PROVIDER_TOKEN");
  const headers = new Headers({ "content-type": "application/json" });
  if (token) {
    headers.set("authorization", `Bearer ${token}`);
  }

  const response = await fetch(providerUrl, {
    method: "POST",
    headers,
    body: JSON.stringify({ from, ...message }),
  });

  if (!response.ok) {
    return { sent: false, reason: "email provider error", status: response.status };
  }

  return { sent: true, provider: "http" };
}
