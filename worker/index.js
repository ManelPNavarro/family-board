import { createRemoteJWKSet, jwtVerify } from 'jose';

let accessKeys;
let keysIssuer;

async function verifyAccess(request, env) {
  const token = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!token || !env.ACCESS_ISSUER || !env.ACCESS_AUD) return false;

  try {
    if (keysIssuer !== env.ACCESS_ISSUER) {
      accessKeys = createRemoteJWKSet(
        new URL('/cdn-cgi/access/certs', env.ACCESS_ISSUER),
      );
      keysIssuer = env.ACCESS_ISSUER;
    }

    await jwtVerify(token, accessKeys, {
      issuer: env.ACCESS_ISSUER,
      audience: env.ACCESS_AUD,
      algorithms: ['RS256'],
      requiredClaims: ['exp', 'sub'],
    });
    return true;
  } catch {
    return false;
  }
}

export default {
  async fetch(request, env) {
    const headers = {
      'Cache-Control': 'private, no-store',
      'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
    };

    if (!await verifyAccess(request, env)) {
      return new Response('Acceso restringido', { status: 403, headers });
    }

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response(null, {
        status: 405,
        headers: { ...headers, Allow: 'GET, HEAD' },
      });
    }

    const { pathname } = new URL(request.url);
    if (pathname === '/api/status') {
      let database = 'unavailable';
      try {
        const result = await env.DB.prepare('SELECT 1 AS ok').first('ok');
        if (result === 1) database = 'ready';
      } catch {
        // No devolver detalles de infraestructura al cliente.
      }
      const status = database === 'ready' ? 200 : 503;
      if (request.method === 'HEAD') return new Response(null, { status, headers });
      return Response.json({ commit: env.COMMIT_SHA, database }, { status, headers });
    }

    if (pathname === '/api' || pathname.startsWith('/api/')) {
      return new Response(null, { status: 404, headers });
    }

    const asset = await env.ASSETS.fetch(request);
    const response = new Response(asset.body, asset);
    for (const [name, value] of Object.entries(headers)) {
      response.headers.set(name, value);
    }
    return response;
  },
};
