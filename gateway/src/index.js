import { createApp } from "./app.js";
import { config } from "./config.js";
import { initDb } from "./db.js";

initDb();
const app = createApp();
app.listen(config.port, config.listenHost, () => {
  console.log(`trade-site gateway on ${config.publicUrl} (${config.listenHost}:${config.port})`);
  if (!config.adminPassword) console.warn("ADMIN_PASSWORD is empty; /admin is disabled");
  if (config.dryRun) console.warn("CLOUDFLARE_DRY_RUN=1; deploys will not upload to Pages");
  else if (!config.cloudflareAccountId || !config.cloudflareApiToken) {
    console.warn("Cloudflare credentials missing; deploys will return CLOUDFLARE_NOT_CONFIGURED");
  }
});
