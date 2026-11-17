// The API Worker. Not deployed yet: production serves static assets only (see wrangler.jsonc).
// It gains the daily schedule (D1), flags (KV) and TWIN rooms (Durable Objects) in later phases.
export default {
  fetch(request: Request): Response {
    const { pathname } = new URL(request.url);
    if (pathname === '/api/health') return Response.json({ ok: true });
    return new Response('Not found', { status: 404 });
  },
};
