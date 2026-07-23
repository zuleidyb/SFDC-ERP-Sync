require("dotenv").config();
const fs = require("fs");
const path = require("path");
const jwt = require("jsonwebtoken");
const jsforce = require("jsforce");

const privateKey = fs.readFileSync(
  path.resolve(__dirname, process.env.SF_PRIVATE_KEY_PATH),
  "utf8"
);

const assertion = jwt.sign(
  {
    iss: process.env.SF_CONSUMER_KEY,
    sub: process.env.SF_USERNAME,
    aud: process.env.SF_LOGIN_URL
  },
  privateKey,
  { algorithm: "RS256", expiresIn: "3m" }
);

async function main() {
  const res = await fetch(`${process.env.SF_LOGIN_URL}/services/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion
    })
  });

  const authData = await res.json();

  if (!res.ok) {
    console.error("Auth failed:", authData);
    process.exit(1);
  }

  console.log("Authenticated. Instance URL:", authData.instance_url);

  const conn = new jsforce.Connection({
    instanceUrl: authData.instance_url,
    accessToken: authData.access_token
  });

  console.log("Subscribing to /data/Order__ChangeEvent ...");
  conn.streaming.topic("/data/Order__ChangeEvent").subscribe((message) => {
    console.log("\n--- CDC EVENT RECEIVED ---");
    console.log(JSON.stringify(message, null, 2));
  });

  console.log(
    "Listening. Go create or update an Order record in Salesforce now."
  );
  console.log("Press Ctrl+C to stop.");
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
