/**
 * Cloudflare Worker Relay cho kho preset FiiO Hand-Picked & Shared
 * Triển khai miễn phí 100% trên Cloudflare Workers (chạy ở nút Singapore/Hong Kong,
 * giúp mạng Việt Nam gọi sang server FiiO Trung Quốc cực nhanh, không cần VPN và vượt CORS).
 */
export default {
  async fetch(request) {
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Accept, Authorization',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    const url = new URL(request.url);
    const upstreamPath = url.pathname.replace(/^\/api\/fiio/, '') + url.search;
    const upstreamUrl = `https://fiiocontrol.fiio.com${upstreamPath}`;

    const headers = new Headers();
    headers.set('Content-Type', request.headers.get('Content-Type') || 'application/json');
    headers.set('Accept', request.headers.get('Accept') || 'application/json, text/plain, */*');
    headers.set('Origin', 'https://fiiocontrol.fiio.com');
    headers.set('Referer', 'https://fiiocontrol.fiio.com/equalizer/hand-picked');
    if (request.headers.get('Authorization')) {
      headers.set('Authorization', request.headers.get('Authorization'));
    }

    try {
      const resp = await fetch(upstreamUrl, {
        method: request.method,
        headers,
        body: request.method === 'POST' ? await request.arrayBuffer() : undefined,
      });
      const respBody = await resp.arrayBuffer();
      return new Response(respBody, {
        status: resp.status,
        headers: {
          ...corsHeaders,
          'Content-Type': resp.headers.get('Content-Type') || 'application/json',
        },
      });
    } catch (err) {
      return new Response(JSON.stringify({ code: 502, msg: String(err) }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  },
};
