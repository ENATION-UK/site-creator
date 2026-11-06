import express from "express";
import { config, canDeploy, cloudflareConfigured } from "./config.js";
import { apiRouter } from "./routes/api.js";
import { adminRouter } from "./routes/admin.js";
import { sendError } from "./errors.js";

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use(express.json({ limit: "32kb" }));
  app.use(express.urlencoded({ extended: false }));

  app.get("/health", (_req, res) => {
    res.json({
      ok: true,
      gateway: config.publicUrl,
      cloudflare: cloudflareConfigured(),
      dry_run: config.dryRun,
      can_deploy: canDeploy(),
    });
  });

  app.use("/v1", apiRouter);
  app.use("/admin", adminRouter);
  app.get("/", (_req, res) => res.redirect("/admin"));

  app.use((err, _req, res, _next) => {
    sendError(res, err);
  });

  return app;
}
