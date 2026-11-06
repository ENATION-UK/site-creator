import express from "express";
import multer from "multer";
import { config, canDeploy } from "../config.js";
import { ApiError, sendError } from "../errors.js";
import { clientAuth, rateLimit } from "../middleware.js";
import { clientId, clientKey, hashKey, newId, projectName, utcNow } from "../ids.js";
import {
  countClientDeploysToday,
  countClientSites,
  createClient,
  getSiteForClient,
  insertDeploy,
  insertSite,
  listClientSites,
  updateSite,
} from "../store.js";
import { extractAndValidateZip, removeTemp } from "../site-files.js";
import { deployDirectory, ensureProject, getProject, pagesUrl } from "../cloudflare.js";

export const apiRouter = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxUploadMb * 1024 * 1024, files: 1 },
});

function sitePayload(row) {
  return {
    id: row.id,
    name: row.name,
    url: row.url,
    cf_project: row.cf_project,
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function zipUpload(req, res, next) {
  upload.single("zip")(req, res, (err) => {
    if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
      sendError(
        res,
        new ApiError(413, "UPLOAD_TOO_LARGE", `Zip must be at most ${config.maxUploadMb}MB`),
      );
      return;
    }
    next(err);
  });
}

apiRouter.post(
  "/clients/register",
  rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 30,
    keyFn: (req) => `reg:${req.ip}`,
  }),
  (req, res) => {
    try {
      const email = typeof req.body?.email === "string" ? req.body.email.trim().slice(0, 200) : "";
      const agent = typeof req.body?.agent === "string" ? req.body.agent.trim().slice(0, 80) : "";
      const id = clientId();
      const key = clientKey();
      const now = utcNow();
      createClient({
        id,
        keyHash: hashKey(key),
        email: email || null,
        agent: agent || null,
        now,
      });
      res.status(201).json({
        client_id: id,
        client_key: key,
        gateway: config.publicUrl,
      });
    } catch (err) {
      sendError(res, err);
    }
  },
);

apiRouter.get("/sites", clientAuth, (req, res) => {
  try {
    res.json({ sites: listClientSites(req.client.id).map(sitePayload) });
  } catch (err) {
    sendError(res, err);
  }
});

apiRouter.post(
  "/sites",
  clientAuth,
  rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 20,
    keyFn: (req) => `deploy:${req.client.id}`,
  }),
  zipUpload,
  async (req, res) => {
    let tmp;
    try {
      if (countClientSites(req.client.id) >= config.maxSitesPerClient) {
        throw new ApiError(
          403,
          "QUOTA_SITES",
          `Free plan allows ${config.maxSitesPerClient} sites per client`,
        );
      }
      if (countClientDeploysToday(req.client.id) >= config.maxDeploysPerDay) {
        throw new ApiError(
          403,
          "QUOTA_DEPLOYS",
          `Free plan allows ${config.maxDeploysPerDay} deploys per day`,
        );
      }
      if (!req.file?.buffer) {
        throw new ApiError(400, "INVALID_ZIP", "Missing zip file field `zip`");
      }
      const name = String(req.body?.name || "site").trim().slice(0, 80) || "site";
      tmp = await extractAndValidateZip(req.file.buffer);
      if (!canDeploy()) {
        throw new ApiError(
          503,
          "CLOUDFLARE_NOT_CONFIGURED",
          "CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN are required to deploy",
        );
      }
      const id = newId("site");
      const cfProject = projectName(req.client.id, name);
      const now = utcNow();
      await ensureProject(cfProject);
      await deployDirectory(tmp, cfProject);
      const project = await getProject(cfProject);
      const url = pagesUrl(project) || `https://${cfProject}.pages.dev`;
      insertSite({
        id,
        client_id: req.client.id,
        name,
        cf_project: cfProject,
        url,
        status: "active",
        created_at: now,
        updated_at: now,
      });
      insertDeploy({ id: newId("dep"), site_id: id, status: "success", created_at: now });
      res.status(201).json(sitePayload({ id, name, url, cf_project: cfProject, status: "active", created_at: now, updated_at: now }));
    } catch (err) {
      sendError(res, err);
    } finally {
      await removeTemp(tmp);
    }
  },
);

apiRouter.post(
  "/sites/:id/deploy",
  clientAuth,
  rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 20,
    keyFn: (req) => `deploy:${req.client.id}`,
  }),
  zipUpload,
  async (req, res) => {
    let tmp;
    try {
      const site = getSiteForClient(req.params.id, req.client.id);
      if (!site) throw new ApiError(404, "SITE_NOT_FOUND", "Site not found");
      if (site.status === "disabled") {
        throw new ApiError(403, "DISABLED", "This site is disabled");
      }
      if (countClientDeploysToday(req.client.id) >= config.maxDeploysPerDay) {
        throw new ApiError(
          403,
          "QUOTA_DEPLOYS",
          `Free plan allows ${config.maxDeploysPerDay} deploys per day`,
        );
      }
      if (!req.file?.buffer) {
        throw new ApiError(400, "INVALID_ZIP", "Missing zip file field `zip`");
      }
      tmp = await extractAndValidateZip(req.file.buffer);
      const now = utcNow();
      try {
        await deployDirectory(tmp, site.cf_project);
        const project = await getProject(site.cf_project);
        const url = pagesUrl(project) || site.url;
        updateSite(site.id, { url, status: "active", updated_at: now });
        insertDeploy({ id: newId("dep"), site_id: site.id, status: "success", created_at: now });
        const updated = getSiteForClient(site.id, req.client.id);
        res.json(sitePayload(updated));
      } catch (err) {
        insertDeploy({
          id: newId("dep"),
          site_id: site.id,
          status: "failed",
          error: err.message,
          created_at: now,
        });
        throw err;
      }
    } catch (err) {
      sendError(res, err);
    } finally {
      await removeTemp(tmp);
    }
  },
);
