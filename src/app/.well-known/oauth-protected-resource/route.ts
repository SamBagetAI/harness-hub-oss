import { resourceMetadata, resourceMetadataCors } from "@/lib/hub/resource-metadata";

// The same document at the root well-known path, for clients that look there
// instead of following the pointer in the connector's 401.
export function GET(req: Request) {
  return resourceMetadata(req);
}

export const OPTIONS = resourceMetadataCors;
