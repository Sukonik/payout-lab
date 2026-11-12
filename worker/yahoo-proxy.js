// Optional: a tiny Cloudflare Worker that lets Payout Lab's live lookup work when a browser blocks direct calls to the quote provider.
// It forwards ONE kind of request (the chart for a single ticker) and adds the header browsers need. It stores nothing and sees only tickers.
// Deploy on Cloudflare's free plan (no card): Workers & Pages -> Create -> paste this -> Deploy, then put the address in Settings -> Live lookups.
// Not tested against the live provider from the project's build environment: use Settings -> Test live lookup after deploying.

const ALLOWED = /^\/v8\/finance\/chart\/([A-Za-z][A-Za-z0-9.\-]{0,9})$/;
const ORIGINS = ["https://sukonik.github.io"];            // add your own domain here if you use one; keep this list short

export default {
  async fetch(request) {
    const origin = request.headers.get("Origin") || "";
    const cors = { "Access-Control-Allow-Origin": ORIGINS.includes(origin) ? origin : ORIGINS[0], "Vary": "Origin" };
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: { ...cors, "Access-Control-Allow-Methods": "GET", "Access-Control-Max-Age": "86400" } });
    if (request.method !== "GET") return new Response("Method not allowed", { status: 405, headers: cors });
    const url = new URL(request.url);
    if (!ALLOWED.test(url.pathname)) return new Response("Not found", { status: 404, headers: cors });
    const upstream = `https://query1.finance.yahoo.com${url.pathname}?range=max&interval=1mo&events=div%2Csplits`;   // fixed query: nothing else is forwarded
    const res = await fetch(upstream, { headers: { "User-Agent": "Mozilla/5.0 (payout-lab live lookup)" }, cf: { cacheTtl: 300, cacheEverything: true } });
    return new Response(res.body, { status: res.status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "public, max-age=300" } });
  },
};
