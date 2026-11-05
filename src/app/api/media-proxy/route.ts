import { NextRequest, NextResponse } from "next/server";
import { getAdminApp } from "@/lib/db-server";
import { getStorage } from "firebase-admin/storage";

export const dynamic = "force-dynamic";

function extractStoragePath(urlStr: string, expectedBucket: string): string | null {
  try {
    const u = new URL(urlStr);
    if (u.hostname === "storage.googleapis.com") {
      const parts = u.pathname.split("/").filter(Boolean);
      if (decodeURIComponent(parts.shift() || "") !== expectedBucket) return null;
      return decodeURIComponent(parts.join("/"));
    }
    if (u.hostname === "firebasestorage.googleapis.com") {
      const match = u.pathname.match(/^\/v0\/b\/([^/]+)\/o\/(.+)$/);
      if (match && decodeURIComponent(match[1]) === expectedBucket) {
        return decodeURIComponent(match[2]);
      }
    }
    if (u.hostname === expectedBucket) return decodeURIComponent(u.pathname.replace(/^\/+/, ""));
  } catch {
    // not a full URL, could be a path
    if (urlStr.startsWith("/")) return urlStr.slice(1);
    return urlStr;
  }
  return null;
}

function isAllowedStorageUrl(urlStr: string, expectedBucket: string): boolean {
  try {
    const u = new URL(urlStr);
    if (u.protocol !== "https:") return false;
    if (u.hostname === "storage.googleapis.com") {
      return decodeURIComponent(u.pathname.split("/").filter(Boolean)[0] || "") === expectedBucket;
    }
    if (u.hostname === "firebasestorage.googleapis.com") {
      const match = u.pathname.match(/^\/v0\/b\/([^/]+)\/o\//);
      return !!match && decodeURIComponent(match[1]) === expectedBucket;
    }
    return u.hostname === expectedBucket;
  } catch {
    return false;
  }
}

function normalizeStoragePath(rawPath: string): string {
  let p = rawPath.replace(/^\/+/, "");
  // Fix accidental duplicate prefixes
  p = p.replace(/^media\/media\//, "media/");
  p = p.replace(/^(comprobantes\/carlitos\/)\1+/, "$1");
  return p;
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
}

export async function HEAD(request: NextRequest) {
  return handleRequest(request, true);
}

export async function GET(request: NextRequest) {
  return handleRequest(request, false);
}

async function handleRequest(request: NextRequest, isHead: boolean) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get("url");

  if (!url) {
    return new NextResponse("Missing url parameter", { status: 400, headers: CORS_HEADERS });
  }

  // 1. Try Firebase Admin Storage direct download first (bypasses CORS & private GCS restrictions)
  const bucketId = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "importadora-carlitos.firebasestorage.app";
  const extractedPath = extractStoragePath(url, bucketId);
  if (extractedPath) {
    const normalizedPath = normalizeStoragePath(extractedPath);
    try {
      const bucket = getStorage(getAdminApp()).bucket();
      let file = bucket.file(normalizedPath);
      let [exists] = await file.exists();

      if (!exists && extractedPath !== normalizedPath) {
        file = bucket.file(extractedPath);
        [exists] = await file.exists();
      }

      if (exists) {
        const [metadata] = await file.getMetadata();
        const contentType = metadata.contentType || "image/jpeg";
        const contentLength = String(metadata.size || 0);

        if (isHead) {
          return new NextResponse(null, {
            status: 200,
            headers: {
              ...CORS_HEADERS,
              "Content-Type": contentType,
              "Content-Length": contentLength,
              "Cache-Control": "public, max-age=86400, immutable",
            },
          });
        }

        const [buffer] = await file.download();
        return new NextResponse(new Uint8Array(buffer), {
          status: 200,
          headers: {
            ...CORS_HEADERS,
            "Content-Type": contentType,
            "Content-Length": String(buffer.length),
            "Cache-Control": "public, max-age=86400, immutable",
          },
        });
      }
    } catch (storageErr) {
      console.warn("[media-proxy] Admin storage lookup failed, falling back to fetch:", storageErr);
    }
  }

  // 2. Fallback to HTTP fetch for tokenized URLs or external sources
  const allowed = isAllowedStorageUrl(url, bucketId);

  if (!allowed) {
    return new NextResponse("URL not allowed", { status: 403, headers: CORS_HEADERS });
  }

  try {
    const upstream = await fetch(url, {
      method: isHead ? "HEAD" : "GET",
      headers: {
        Accept: "image/*,*/*",
      },
    });

    if (!upstream.ok) {
      return new NextResponse(`Upstream error: ${upstream.status}`, {
        status: upstream.status,
        headers: CORS_HEADERS,
      });
    }

    const contentType = upstream.headers.get("content-type") || "image/jpeg";

    if (isHead) {
      return new NextResponse(null, {
        status: 200,
        headers: {
          ...CORS_HEADERS,
          "Content-Type": contentType,
          "Cache-Control": "public, max-age=86400, immutable",
        },
      });
    }

    const body = await upstream.arrayBuffer();
    return new NextResponse(body, {
      status: 200,
      headers: {
        ...CORS_HEADERS,
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400, immutable",
      },
    });
  } catch (err) {
    console.error("[media-proxy] fetch error:", err);
    return new NextResponse("Proxy fetch failed", { status: 502, headers: CORS_HEADERS });
  }
}
