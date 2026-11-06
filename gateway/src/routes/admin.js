import express from "express";
import { adminAuth } from "../middleware.js";
import { renderDashboard } from "../admin/render.js";
import { disableClient, getSite, listClients, listSites, stats, updateSite } from "../store.js";
import { deleteProject } from "../cloudflare.js";
import { utcNow } from "../ids.js";
import { cloudflareConfigured } from "../config.js";

export const adminRouter = express.Router();
adminRouter.use(adminAuth);

adminRouter.get("/", (req, res) => {
  res.type("html").send(
    renderDashboard({
      stats: stats(),
      clients: listClients(),
      sites: listSites(),
      notice: req.query.notice,
      error: req.query.error,
    }),
  );
});

adminRouter.post("/sites/:id/disable", async (req, res) => {
  const site = getSite(req.params.id);
  if (!site) {
    res.redirect("/admin?error=" + encodeURIComponent("站点不存在"));
    return;
  }
  if (site.status === "disabled") {
    res.redirect("/admin?notice=" + encodeURIComponent("站点已停用"));
    return;
  }
  try {
    if (cloudflareConfigured() && site.cf_project) {
      try {
        await deleteProject(site.cf_project);
      } catch (err) {
        if (!/not found/i.test(err.message)) throw err;
      }
    }
    updateSite(site.id, { status: "disabled", updated_at: utcNow() });
    res.redirect("/admin?notice=" + encodeURIComponent(`已停用 ${site.name}，Cloudflare 项目已删除`));
  } catch (err) {
    res.redirect("/admin?error=" + encodeURIComponent(err.message));
  }
});

adminRouter.post("/clients/:id/disable", (req, res) => {
  disableClient(req.params.id, true);
  res.redirect("/admin?notice=" + encodeURIComponent("已停用该用户"));
});

adminRouter.post("/clients/:id/enable", (req, res) => {
  disableClient(req.params.id, false);
  res.redirect("/admin?notice=" + encodeURIComponent("已恢复该用户"));
});
