import { resourceMetadata, resourceMetadataCors } from "@/lib/hub/resource-metadata";

// Sign-in metadata for the connector at /api/mcp. This is the address the
// connector's 401 points to. See lib/hub/resource-metadata.ts.
export function GET(req: Request) {
  return resourceMetadata(req);
}

export const OPTIONS = resourceMetadataCors;
