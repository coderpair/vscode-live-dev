import { Router, Request } from "express"
import { promises as fs } from "fs"
import { appSettings } from "../appsettings"
import * as path from "path"
import { rootPath } from "../constants"
import { ensureAuthenticated, authenticated, replaceTemplates, redirect } from "../http"
import { DashboardProvider } from "../dashboard"

export const router = Router()

const provider = new DashboardProvider()

router.get("/", async (req, res) => {
  if (!authenticated(req)) {
    return redirect(req, res, "login", {
      // req.baseUrl can be blank if already at the root.
      to: req.baseUrl && req.baseUrl !== "/" ? req.baseUrl : undefined,
    })
  }
  res.send(await getRoot(req))
})

router.post("/", ensureAuthenticated, async (req, res) => {
    const response = provider.handlePost(req);
    res.json(response)
})

const getRoot = async (req: Request, error?: Error): Promise<string> => {
  const content = await fs.readFile(path.join(rootPath, "src/browser/pages/home.html"), "utf8")
  
  return replaceTemplates(
    req,
    content
    .replace(/{{COLLAB}}/, appSettings.useCollaboration ? "<span style='color:#66b2ff;font-weight:bold'>Enabled</span>" : "<span style='color:#ff6666;font-weight:bold'>Disabled</span>")
    .replace(/{{VSCODE_SERVER}}/, appSettings.disabled ? "<span style='color:#ff6666;font-weight:bold'>Server Offline</span>" : "<span style='color:#66b2ff;font-weight:bold'>Server Running</span>")
    .replace(/{{COLLAB_CHECKED}}/, appSettings.useCollaboration ? "checked":"")
    .replace(/{{VSCODE_SERVER_CHECKED}}/, appSettings.disabled ? "checked":"")
    .replace(/{{ERROR}}/, error ? "<div class=\"error\">" + error.message + "</div>" : "")
  )
}


