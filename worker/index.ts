interface Env {
  GIMED_EDGE_URL: string;
  GIMED_PROXY_SECRET: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const incoming = new URL(request.url);
    if (!incoming.pathname.startsWith("/api/v1/")) {
      return Response.json({ error: { code: "NOT_FOUND", message: "Ruta de API desconocida." } }, { status: 404 });
    }
    const upstream = new URL(env.GIMED_EDGE_URL);
    if (upstream.protocol !== "https:" || !upstream.pathname.endsWith("/functions/v1/api") || upstream.username || upstream.password) {
      return Response.json({ error: { code: "SERVICE", message: "El servicio no está configurado." } }, { status: 503 });
    }
    upstream.pathname += incoming.pathname.slice(4);
    upstream.search = incoming.search;
    const headers = new Headers();
    for (const key of ["origin", "cookie", "content-type", "idempotency-key", "x-gimed-csrf"]) {
      const value = request.headers.get(key);
      if (value) headers.set(key, value);
    }
    headers.set("x-gimed-proxy", env.GIMED_PROXY_SECRET);
    try {
      const response = await fetch(upstream, { method: request.method, headers, body: request.body, redirect: "manual" });
      const outgoing = new Headers(response.headers);
      outgoing.set("Cache-Control", "private, no-store");
      outgoing.set("Referrer-Policy", "no-referrer");
      return new Response(response.body, { status: response.status, headers: outgoing });
    } catch {
      return Response.json({ error: { code: "NETWORK", message: "No hay conexión con el servicio de GIMED." } },
        { status: 503, headers: { "Cache-Control": "no-store" } });
    }
  },
};
