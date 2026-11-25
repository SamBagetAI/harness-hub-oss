import {
  metadataCorsOptionsRequestHandler,
  protectedResourceHandlerClerk,
} from "@clerk/mcp-tools/next";
import { MCP_PATH, mcpUrl } from "./config";

/**
 * The sign-in metadata document (RFC 9728 "protected resource metadata").
 *
 * When Claude gets a 401 from the connector it reads this document to learn
 * two things: which resource it is signing in to (`resource`, which must equal
 * the connector address exactly as the person typed it) and which server
 * handles the sign-in (`authorization_servers`, our Clerk application, derived
 * by the Clerk helper from the publishable key).
 */

/** Where the 401 from /api/mcp points. The standard path form: /.well-known/oauth-protected-resource + the resource's path. */
export const RESOURCE_METADATA_PATH = `/.well-known/oauth-protected-resource${MCP_PATH}`;

export function resourceMetadata(req: Request): Response | Promise<Response> {
  // The helper would default `resource` to the request's origin. Properties
  // passed here are applied last, so this sets it to the full connector address.
  return protectedResourceHandlerClerk({
    resource: mcpUrl(),
    resource_name: "Harness Hub",
    // ChatGPT registers its client with these scopes, then asks for "openid" as well, since our Clerk
    // server speaks OpenID Connect. Clerk refuses a scope the client was not registered with, so it is listed.
    scopes_supported: ["openid", "profile", "email"],
  })(req);
}

export const resourceMetadataCors = metadataCorsOptionsRequestHandler();
