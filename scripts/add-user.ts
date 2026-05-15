import { OAuth2Client } from "google-auth-library";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve } from "path";
import { createServer } from "http";
import { URL } from "url";

// Load .env.local since ts-node doesn't pick it up automatically
const envPath = resolve(process.cwd(), ".env.local");
for (const line of readFileSync(envPath, "utf-8").split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eqIdx = trimmed.indexOf("=");
  if (eqIdx === -1) continue;
  const key = trimmed.slice(0, eqIdx).trim();
  let value = trimmed.slice(eqIdx + 1).trim();
  value = value.replace(/\s+#.*$/, "").replace(/^["']|["']$/g, "");
  if (!process.env[key]) process.env[key] = value;
}

const CLIENT_SECRET_PATH = resolve(process.cwd(), "scripts/oauth-client.json");
const TOKEN_PATH = resolve(process.cwd(), "scripts/.oauth-token.json");
const REDIRECT_PORT = 3456;
const SCOPES = ["https://www.googleapis.com/auth/analytics.manage.users"];

async function getAuthClient(): Promise<OAuth2Client> {
  const parsed = JSON.parse(readFileSync(CLIENT_SECRET_PATH, "utf-8"));
  const { client_id, client_secret } = parsed.installed ?? parsed.web;

  const oauth2Client = new OAuth2Client(
    client_id,
    client_secret,
    `http://localhost:${REDIRECT_PORT}`,
  );

  if (existsSync(TOKEN_PATH)) {
    oauth2Client.setCredentials(JSON.parse(readFileSync(TOKEN_PATH, "utf-8")));
    return oauth2Client;
  }

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
  });

  console.log("\nOpen this URL in your browser:\n");
  console.log(authUrl);
  console.log(
    `\nWaiting for callback on http://localhost:${REDIRECT_PORT} ...\n`,
  );

  const code = await new Promise<string>((resolve, reject) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url!, `http://localhost:${REDIRECT_PORT}`);
      const code = url.searchParams.get("code");
      const error = url.searchParams.get("error");

      if (!code && !error) {
        res.end();
        return;
      }

      res.end(code ? "Authenticated! You can close this tab." : `Error: ${error}`);
      server.close();
      if (code) resolve(code);
      else reject(new Error(`OAuth error: ${error}`));
    }).listen(REDIRECT_PORT);
  });

  const { tokens } = await oauth2Client.getToken(code);
  oauth2Client.setCredentials(tokens);
  writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
  console.log("Token saved to scripts/.oauth-token.json\n");

  return oauth2Client;
}

async function run() {
  try {
    console.log("Attempting to bind service account to GA4 property");

    const auth = await getAuthClient();
    const { token } = await auth.getAccessToken();

    const res = await fetch(
      `https://analyticsadmin.googleapis.com/v1alpha/properties/${process.env.GA_PROPERTY_ID}/accessBindings`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          user: process.env.GA_CLIENT_EMAIL,
          roles: ["predefinedRoles/viewer"],
        }),
      },
    );

    if (!res.ok) {
      throw new Error(`API ${res.status}: ${await res.text()}`);
    }

    const binding = await res.json();
    console.log(`Service account ${process.env.GA_CLIENT_EMAIL} added`);
    console.log("Resource Name:", binding.name);
  } catch (err) {
    console.error("Failed:", err);
  }
}

run();
