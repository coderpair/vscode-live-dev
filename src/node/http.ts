import { field, logger } from "@coder/logger"
import {Request, Response, NextFunction} from "express"
import * as expressCore from "express-serve-static-core"
import qs from "qs"
import safeCompare from "safe-compare"
import { Emitter } from "../common/emitter"
import { HttpCode, HttpError } from "../common/http"
import { normalize, Options } from "../common/util"
import { AuthType } from "./cli"
import { commit, rootPath } from "./constants"
import { hash } from "./util"


export type Cookies = { [key: string]: string | undefined }
export type PostData = { [key: string]: string | string[] | undefined }

export interface IAuthUser {
  user:string,
	key: string
}

interface AuthPayload extends Cookies {
  key?: string
}

const _onDisable = new Emitter<void>()
export const onDisable = _onDisable.event

/**
 * Replace common variable strings in HTML templates.
 */
export const replaceTemplates = <T extends object>(
  req: Request,
  content: string,
  extraOpts?: Omit<T, "base" | "csStaticBase" | "logLevel">,
): string => {
  const base = relativeRoot(req)
  const options: Options = {
    base,
    csStaticBase: base + "/static/" + commit + rootPath,
    logLevel: logger.level,
    ...extraOpts,
  }
  return content
    .replace(/{{TO}}/g, (typeof req.query.to === "string" && req.query.to) || "/")
    .replace(/{{BASE}}/g, options.base)
    .replace(/{{CS_STATIC_BASE}}/g, options.csStaticBase)
    .replace(/"{{OPTIONS}}"/, `'${JSON.stringify(options)}'`)
}

/**
 * Throw an error if not authorized. Call `next` if provided.
 */
export const ensureAuthenticated = (req: Request, _?: Response, next?: NextFunction): void => {
  if (!authenticated(req)) {
    throw new HttpError("Unauthorized", HttpCode.Unauthorized)
  }
  if (next) {
    next()
  }
}

/**
 * Return true if authenticated via cookies.
 */
export const authenticated = (req: Request, payload?: AuthPayload): IAuthUser | boolean => {
  switch (req.args.auth) {
    case AuthType.None:
      return true
    case AuthType.Password:
      if (typeof payload === "undefined") {
        payload={
          key:req.cookies.key
        }
      }
      if(
        payload.key &&
        (req.args["hashed-password"]
          ? safeCompare(payload.key, req.args["hashed-password"])
          : req.args.password && safeCompare(payload.key, hash(req.args.password)))
      ){
        return {user: 'default' , key: payload.key}
      }
      if(req.args.users && payload.key){
        for(let user in req.args.users){
          if (safeCompare(payload.key, hash(req.args.users[user].password))) {
            return {user: user , key: payload.key}
          }
        }
      }
      return false
    default:
      throw new Error(`Unsupported auth type ${req.args.auth}`)
  }
}

/**
    * Return the provided password value if the payload contains the right
    * password otherwise return false.
    */
export const adminAuthenticated = (req: Request, payload?: AuthPayload): string | boolean => {
    if (req.args.admin && payload && payload.key) {
        if (safeCompare(payload.key, hash(req.args.admin))) {
           return payload.key;
        }
    }
    return false;
 };


/**
  * Disable vscode server from dashboard
  * 
  */
export const disableServer = (): void => {
    _onDisable.emit()
};

/**
 * Get the relative path that will get us to the root of the page. For each
 * slash we need to go up a directory. For example:
 * / => .
 * /foo => .
 * /foo/ => ./..
 * /foo/bar => ./..
 * /foo/bar/ => ./../..
 */
export const relativeRoot = (req: Request): string => {
  const depth = (req.originalUrl.split("?", 1)[0].match(/\//g) || []).length
  return normalize("./" + (depth > 1 ? "../".repeat(depth - 1) : ""))
}

/**
 * Redirect relatively to `/${to}`. Query variables will be preserved.
 * `override` will merge with the existing query (use `undefined` to unset).
 */
export const redirect = (
  req: Request,
  res: Response,
  to: string,
  override: expressCore.Query = {},
): void => {
  const query = Object.assign({}, req.query, override)
  Object.keys(override).forEach((key) => {
    if (typeof override[key] === "undefined") {
      delete query[key]
    }
  })

  const relativePath = normalize(`${relativeRoot(req)}/${to}`, true)
  const queryString = qs.stringify(query)
  const redirectPath = `${relativePath}${queryString ? `?${queryString}` : ""}`
  logger.debug(`redirecting from ${req.originalUrl} to ${redirectPath}`)
  res.redirect(redirectPath)
}

/**
 * Get the value that should be used for setting a cookie domain. This will
 * allow the user to authenticate once no matter what sub-domain they use to log
 * in. This will use the highest level proxy domain (e.g. `coder.com` over
 * `test.coder.com` if both are specified).
 */
export const getCookieDomain = (host: string, proxyDomains: string[]): string | undefined => {
  const idx = host.lastIndexOf(":")
  host = idx !== -1 ? host.substring(0, idx) : host
  // If any of these are true we will still set cookies but without an explicit
  // `Domain` attribute on the cookie.
  if (
    // The host can be be blank or missing so there's nothing we can set.
    !host ||
    // IP addresses can't have subdomains so there's no value in setting the
    // domain for them. Assume that anything with a : is ipv6 (valid domain name
    // characters are alphanumeric or dashes)...
    host.includes(":") ||
    // ...and that anything entirely numbers and dots is ipv4 (currently tlds
    // cannot be entirely numbers).
    !/[^0-9.]/.test(host) ||
    // localhost subdomains don't seem to work at all (browser bug?). A cookie
    // set at dev.localhost cannot be read by 8080.dev.localhost.
    host.endsWith(".localhost") ||
    // Domains without at least one dot (technically two since domain.tld will
    // become .domain.tld) are considered invalid according to the spec so don't
    // set the domain for them. In my testing though localhost is the only
    // problem (the browser just doesn't store the cookie at all). localhost has
    // an additional problem which is that a reverse proxy might give
    // code-server localhost even though the domain is really domain.tld (by
    // default NGINX does this).
    !host.includes(".")
  ) {
    logger.debug("no valid cookie doman", field("host", host))
    return undefined
  }

  proxyDomains.forEach((domain) => {
    if (host.endsWith(domain) && domain.length < host.length) {
      host = domain
    }
  })

  logger.debug("got cookie doman", field("host", host))
  return host || undefined
}
