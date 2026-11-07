/**
 * Cloudflare Worker for KYT Trip Shortlinks
 * Provides anonymous 60-day Key-Value storage for sharing full AI-refined travel itineraries.
 */

const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';
const DAY_MS = 86400000;
const EPOCH = Date.UTC(2024, 0, 1);

/**
 * A 6-character share code: 2 characters for the day it was made, then 4 random ones. Two shares can only clash when
 * they are made on the same day (or exactly 1,296 days apart), which cuts the chance enormously without making the link
 * any longer. The random part comes from crypto, with no bias towards any letter. Old 6-character codes keep working.
 */
export function makeCode(now = Date.now(), rand = (n) => crypto.getRandomValues(new Uint8Array(n))) {
  const day = Math.floor((now - EPOCH) / DAY_MS);
  const anchor = (((day % 1296) + 1296) % 1296).toString(36).padStart(2, '0');
  let tail = '';
  while (tail.length < 4) {
    for (const b of rand(8)) {
      if (b < 252 && tail.length < 4) tail += ALPHABET[b % 36];       // 252 = 7 x 36: no letter is likelier than another
    }
  }
  return anchor + tail;
}

/** Picks a code nobody is using. KV has no "put only if new", so look first and try again on a clash. */
export async function freeCode(kv, now = Date.now(), rand) {
  for (let attempt = 0; attempt < 8; attempt++) {
    const id = makeCode(now, rand);
    if (!(await kv.get(id))) return id;
  }
  return null;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Standard CORS headers allowing web apps (including vividnova.com) to access the API
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: cors });
    }

    // ── 1. SAVE TRIP (POST /api/trip) ──────────────────────────────────────────
    if (request.method === 'POST' && url.pathname === '/api/trip') {
      try {
        const tripData = await request.json();
        if (!tripData || typeof tripData !== 'object') {
          return new Response(JSON.stringify({ error: 'Invalid trip data' }), {
            status: 400,
            headers: { ...cors, 'Content-Type': 'application/json' }
          });
        }

        // Store in Cloudflare KV with a 60-day auto-expiry (5,184,000 seconds)
        // Zero user data or IP addresses are stored—strictly anonymous itinerary JSON.
        let savedId;
        if (env.TRIP_KV) {
          savedId = await freeCode(env.TRIP_KV);
          if (!savedId) {
            return new Response(JSON.stringify({ error: 'Could not find a free code, please try again' }), {
              status: 503,
              headers: { ...cors, 'Content-Type': 'application/json' }
            });
          }
          await env.TRIP_KV.put(savedId, JSON.stringify(tripData), {
            expirationTtl: 60 * 86400
          });
        } else {
          return new Response(JSON.stringify({ error: 'TRIP_KV binding missing in Cloudflare Worker settings' }), {
            status: 500,
            headers: { ...cors, 'Content-Type': 'application/json' }
          });
        }

        return new Response(JSON.stringify({ id: savedId, success: true }), {
          headers: { ...cors, 'Content-Type': 'application/json' }
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500,
          headers: { ...cors, 'Content-Type': 'application/json' }
        });
      }
    }

    // ── 2. RETRIEVE TRIP (GET /api/trip/:id) ───────────────────────────────────
    if (request.method === 'GET' && url.pathname.startsWith('/api/trip/')) {
      const id = url.pathname.replace('/api/trip/', '').trim();
      if (!id) {
        return new Response(JSON.stringify({ error: 'Missing trip ID' }), {
          status: 400,
          headers: { ...cors, 'Content-Type': 'application/json' }
        });
      }

      if (!env.TRIP_KV) {
        return new Response(JSON.stringify({ error: 'TRIP_KV binding missing' }), {
          status: 500,
          headers: { ...cors, 'Content-Type': 'application/json' }
        });
      }

      const tripJson = await env.TRIP_KV.get(id);
      if (!tripJson) {
        return new Response(JSON.stringify({ error: 'Trip not found or expired' }), {
          status: 404,
          headers: { ...cors, 'Content-Type': 'application/json' }
        });
      }

      return new Response(tripJson, {
        headers: { ...cors, 'Content-Type': 'application/json' }
      });
    }

    // ── Health Check ──────────────────────────────────────────────────────────
    if (url.pathname === '/' || url.pathname === '/health') {
      return new Response(JSON.stringify({ status: 'ok', service: 'KYT Shortener' }), {
        headers: { ...cors, 'Content-Type': 'application/json' }
      });
    }

    return new Response('Not Found', { status: 404, headers: cors });
  }
};
