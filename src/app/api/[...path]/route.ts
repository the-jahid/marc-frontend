type ProxyContext = {
  params: Promise<{
    path: string[];
  }>;
};

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

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: ProxyContext) {
  return proxyToApiServer(request, context);
}

export async function POST(request: Request, context: ProxyContext) {
  return proxyToApiServer(request, context);
}

export async function PUT(request: Request, context: ProxyContext) {
  return proxyToApiServer(request, context);
}

export async function PATCH(request: Request, context: ProxyContext) {
  return proxyToApiServer(request, context);
}

export async function DELETE(request: Request, context: ProxyContext) {
  return proxyToApiServer(request, context);
}

async function proxyToApiServer(
  request: Request,
  context: ProxyContext,
): Promise<Response> {
  const targetUrl = await buildTargetUrl(request, context);
  const frontendOrigin = new URL(request.url).origin;

  if (targetUrl.origin === frontendOrigin) {
    return Response.json(
      {
        message:
          "API_SERVER_URL points to the frontend. Set API_SERVER_URL to the Nest API server URL.",
      },
      { status: 502 },
    );
  }

  const proxyHeaders = new Headers(request.headers);

  for (const header of HOP_BY_HOP_HEADERS) {
    proxyHeaders.delete(header);
  }

  try {
    return await fetch(targetUrl, {
      body: requestHasBody(request) ? request.body : undefined,
      cache: "no-store",
      duplex: "half",
      headers: proxyHeaders,
      method: request.method,
      redirect: "manual",
    } as RequestInit & { duplex: "half" });
  } catch (error) {
    return Response.json(
      {
        message:
          error instanceof Error
            ? `Could not reach API server: ${error.message}`
            : "Could not reach API server.",
      },
      { status: 502 },
    );
  }
}

async function buildTargetUrl(
  request: Request,
  context: ProxyContext,
): Promise<URL> {
  const { path } = await context.params;
  const apiServerUrl =
    process.env.API_SERVER_URL?.trim() ||
    process.env.API_URL?.trim() ||
    DEFAULT_API_SERVER_URL;
  const targetUrl = new URL(apiServerUrl);
  const basePath = targetUrl.pathname.replace(/\/+$/, "");
  const targetPath = path.map(encodeURIComponent).join("/");

  targetUrl.pathname = `${basePath}/${targetPath}`;
  targetUrl.search = new URL(request.url).search;

  return targetUrl;
}

function requestHasBody(request: Request): boolean {
  return !["GET", "HEAD"].includes(request.method.toUpperCase());
}
