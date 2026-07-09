const DEFAULT_API_SERVER_URL = "http://localhost:3000";
const HOP_BY_HOP_HEADERS = [
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "host",
];

export function buildApiServerUrl(path: string): URL {
  const apiServerUrl =
    process.env.API_SERVER_URL?.trim() ||
    process.env.API_URL?.trim() ||
    DEFAULT_API_SERVER_URL;
  const targetUrl = new URL(apiServerUrl);
  const basePath = targetUrl.pathname.replace(/\/+$/, "");
  const targetPath = path.replace(/^\/+/, "");

  targetUrl.pathname = `${basePath}/${targetPath}`;

  return targetUrl;
}

export function fetchApiServer(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  return fetch(buildApiServerUrl(path), {
    cache: "no-store",
    ...init,
  });
}

export function jsonHeadersFrom(request: Request): Headers {
  const headers = new Headers();
  const contentType = request.headers.get("content-type");

  if (contentType) {
    headers.set("content-type", contentType);
  }

  return headers;
}

export function proxyApiServerResponse(response: Response): Response {
  const headers = new Headers(response.headers);

  for (const header of HOP_BY_HOP_HEADERS) {
    headers.delete(header);
  }

  return new Response(response.body, {
    headers,
    status: response.status,
    statusText: response.statusText,
  });
}
