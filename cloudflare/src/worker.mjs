const ALLOWED_ORIGINS = new Set([
  "https://villano-lab.github.io",
  "http://127.0.0.1:8000",
  "http://127.0.0.1:8765",
  "http://localhost:8000",
  "http://localhost:8765",
]);

const SESSION_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;
const MAX_BATCH_SIZE = 100;

function corsHeaders(request) {
  const origin = request.headers.get("Origin");
  const allowedOrigin = origin && ALLOWED_ORIGINS.has(origin) ? origin : "https://villano-lab.github.io";
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function json(request, body, status = 200) {
  return Response.json(body, {
    status,
    headers: corsHeaders(request),
  });
}

function endpointFromRequest(request) {
  const url = new URL(request.url);
  const match = url.pathname.match(/^\/api\/sessions\/([^/]+)\/submissions$/);
  if (!match) return null;

  const sessionName = decodeURIComponent(match[1]);
  if (!SESSION_PATTERN.test(sessionName)) return null;
  return { url, sessionName };
}

function validDrop(value) {
  return Number.isFinite(value) && value >= 1 && value <= 5;
}

function validTime(value) {
  return Number.isFinite(value) && value > 0 && value < 60;
}

async function listSubmissions(request, env, endpoint) {
  const verticalDrop = Number(endpoint.url.searchParams.get("drop"));
  if (!validDrop(verticalDrop)) return json(request, { error: "Invalid vertical drop" }, 400);

  const result = await env.DB.prepare(
    `SELECT travel_time AS travelTime
       FROM submissions
      WHERE session_name = ? AND vertical_drop = ?
      ORDER BY created_at, id`,
  )
    .bind(endpoint.sessionName, verticalDrop)
    .all();

  return json(request, {
    session: endpoint.sessionName,
    verticalDrop,
    times: result.results.map((row) => row.travelTime),
  });
}

async function addSubmissions(request, env, endpoint) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json(request, { error: "Expected a JSON body" }, 400);
  }

  const verticalDrop = Number(body.verticalDrop);
  const submissions = body.submissions;
  if (!validDrop(verticalDrop)) return json(request, { error: "Invalid vertical drop" }, 400);
  if (!Array.isArray(submissions) || submissions.length < 1 || submissions.length > MAX_BATCH_SIZE) {
    return json(request, { error: `Submit between 1 and ${MAX_BATCH_SIZE} trials` }, 400);
  }

  const normalized = submissions.map((submission) => ({
    id: String(submission.id || ""),
    time: Number(submission.time),
  }));
  if (
    normalized.some(
      (submission) =>
        !/^[a-zA-Z0-9_-]{8,100}$/.test(submission.id) || !validTime(submission.time),
    )
  ) {
    return json(request, { error: "One or more submissions are invalid" }, 400);
  }

  const statements = normalized.map((submission) =>
    env.DB.prepare(
      `INSERT OR IGNORE INTO submissions
        (session_name, vertical_drop, submission_id, travel_time)
       VALUES (?, ?, ?, ?)`,
    ).bind(endpoint.sessionName, verticalDrop, submission.id, submission.time),
  );
  const results = await env.DB.batch(statements);
  const inserted = results.reduce((sum, result) => sum + Number(result.meta?.changes || 0), 0);

  return json(request, { accepted: inserted, duplicates: normalized.length - inserted }, 201);
}

async function resetSubmissions(request, env, endpoint) {
  const authorization = request.headers.get("Authorization");
  if (!env.TEACHER_RESET_TOKEN || authorization !== `Bearer ${env.TEACHER_RESET_TOKEN}`) {
    return json(request, { error: "Teacher authorization required" }, 401);
  }

  const verticalDrop = Number(endpoint.url.searchParams.get("drop"));
  if (!validDrop(verticalDrop)) return json(request, { error: "Invalid vertical drop" }, 400);

  const result = await env.DB.prepare(
    "DELETE FROM submissions WHERE session_name = ? AND vertical_drop = ?",
  )
    .bind(endpoint.sessionName, verticalDrop)
    .run();

  return json(request, { deleted: Number(result.meta?.changes || 0) });
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }

    const endpoint = endpointFromRequest(request);
    if (!endpoint) return json(request, { error: "Not found" }, 404);

    try {
      if (request.method === "GET") return await listSubmissions(request, env, endpoint);
      if (request.method === "POST") return await addSubmissions(request, env, endpoint);
      if (request.method === "DELETE") return await resetSubmissions(request, env, endpoint);
      return json(request, { error: "Method not allowed" }, 405);
    } catch (error) {
      console.error(error);
      return json(request, { error: "Internal server error" }, 500);
    }
  },
};
