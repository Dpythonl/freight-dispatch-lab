import { createServer as createHttpServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";
import { createScenario } from "./src/scenario.js";
import { planScenario } from "./src/planner.js";
import { runExperiment } from "./src/experiment.js";
import { addScenarioEvent, approveAssignments, simulateApprovedAssignments } from "./src/execution.js";
import { AppError } from "./src/errors.js";
import { createScenarioStore, createSession } from "./src/store.js";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_ROOT = path.join(ROOT, "public");
const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};
const MAX_BODY_BYTES = 1_000_000;

function json(response, statusCode, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  response.end(body);
}

async function readJson(request) {
  const chunks = [];
  let totalBytes = 0;
  for await (const chunk of request) {
    totalBytes += chunk.length;
    if (totalBytes > MAX_BODY_BYTES) throw new AppError("Request body is too large.", 413);
    chunks.push(chunk);
  }
  if (totalBytes === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new AppError("Request body must be valid JSON.", 400);
  }
}

function requireObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new AppError("Request body must be a JSON object.", 400);
  }
  return value;
}

async function serveStatic(response, pathname) {
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    return json(response, 400, { error: "Invalid URL path." });
  }
  const relativePath = decodedPath === "/" ? "index.html" : decodedPath.replace(/^\/+/, "");
  const filePath = path.resolve(PUBLIC_ROOT, relativePath);
  if (!filePath.startsWith(`${PUBLIC_ROOT}${path.sep}`)) return json(response, 404, { error: "Not found." });

  let body;
  try {
    body = await readFile(filePath);
  } catch {
    return json(response, 404, { error: "Not found." });
  }
  const contentType = MIME_TYPES[path.extname(filePath).toLowerCase()];
  if (!contentType) return json(response, 404, { error: "Not found." });
  response.writeHead(200, {
    "content-type": contentType,
    "content-length": body.length,
    "cache-control": "no-cache",
    "x-content-type-options": "nosniff",
  });
  response.end(body);
}

function findSession(store, scenarioId) {
  const session = store.get(scenarioId);
  if (!session) throw new AppError(`Scenario ${scenarioId} was not found.`, 404);
  return session;
}

async function handleApi(request, response, url, store) {
  const parts = url.pathname.split("/").filter(Boolean).map((part) => decodeURIComponent(part));

  if (parts.length === 2 && parts[0] === "api" && parts[1] === "experiments" && request.method === "POST") {
    const body = requireObject(await readJson(request));
    try {
      return json(response, 200, runExperiment(body.seed, body.count ?? 8));
    } catch (error) {
      if (error instanceof RangeError) throw new AppError(error.message, 400);
      throw error;
    }
  }

  if (parts.length === 2 && parts[0] === "api" && parts[1] === "scenarios" && request.method === "POST") {
    const body = requireObject(await readJson(request));
    if (!Number.isInteger(body.seed) || body.seed < 0 || body.seed > 0xffffffff) {
      throw new AppError("Seed must be an integer between 0 and 4294967295.", 400);
    }
    const scenario = createScenario(body.seed);
    scenario.id = `scenario-${body.seed}-${randomUUID().slice(0, 8)}`;
    const session = createSession(scenario);
    addScenarioEvent(session.scenario, "scenario_created", "scenario", scenario.id, `Generated seed ${scenario.seed}.`);
    store.add(session);
    return json(response, 201, session);
  }

  if (parts.length === 3 && parts[0] === "api" && parts[1] === "scenarios" && request.method === "GET") {
    return json(response, 200, findSession(store, parts[2]));
  }

  if (parts.length === 4 && parts[0] === "api" && parts[1] === "scenarios") {
    const session = findSession(store, parts[2]);
    const action = parts[3];

    if (action === "compare" && request.method === "POST") {
      requireObject(await readJson(request));
      session.comparison = {
        baseline: planScenario(session.scenario, "baseline"),
        profitAware: planScenario(session.scenario, "profit-aware"),
      };
      addScenarioEvent(session.scenario, "comparison_run", "scenario", session.scenario.id, "Compared baseline and profit-aware dispatch plans.");
      store.replace(session);
      return json(response, 200, session);
    }

    if (action === "dispatch" && request.method === "POST") {
      const body = requireObject(await readJson(request));
      if (!session.comparison) throw new AppError("Compare strategies before selecting a dispatch plan.", 409);
      if (session.activePlan?.assignments.some((assignment) => assignment.decisionStatus !== "pending_approval")) {
        throw new AppError("A plan with approved work cannot be replaced.", 409);
      }
      if (body.strategy !== "baseline" && body.strategy !== "profit-aware") {
        throw new AppError("Strategy must be 'baseline' or 'profit-aware'.", 400);
      }
      session.activePlan = structuredClone(session.comparison[body.strategy === "baseline" ? "baseline" : "profitAware"]);
      addScenarioEvent(
        session.scenario,
        "plan_selected",
        "scenario",
        session.scenario.id,
        `Selected the ${body.strategy} plan for review.`,
      );
      store.replace(session);
      return json(response, 200, session);
    }

    if (action === "approve" && request.method === "POST") {
      const body = requireObject(await readJson(request));
      const next = approveAssignments(session, body.assignmentIds);
      store.replace(next);
      return json(response, 200, next);
    }

    if (action === "simulate" && request.method === "POST") {
      requireObject(await readJson(request));
      const next = simulateApprovedAssignments(session);
      store.replace(next);
      return json(response, 200, next);
    }
  }

  return json(response, 404, { error: "API route not found." });
}

export function createServer({ store = createScenarioStore() } = {}) {
  return createHttpServer(async (request, response) => {
    try {
      const url = new URL(request.url, "http://127.0.0.1");
      if (url.pathname.startsWith("/api/")) {
        await handleApi(request, response, url, store);
      } else if (request.method === "GET" || request.method === "HEAD") {
        await serveStatic(response, url.pathname);
      } else {
        json(response, 405, { error: "Method not allowed." });
      }
    } catch (error) {
      const statusCode = Number.isInteger(error.statusCode) ? error.statusCode : 500;
      if (statusCode >= 500) process.stderr.write(`${error.stack ?? error}\n`);
      json(response, statusCode, { error: statusCode >= 500 ? "Internal server error." : error.message });
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const port = Number(process.env.PORT ?? 4173);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    process.stderr.write("PORT must be an integer from 1 to 65535.\n");
    process.exitCode = 1;
  } else {
    createServer().listen(port, "127.0.0.1", () => {
      process.stdout.write(`Freight dispatch dashboard running at http://127.0.0.1:${port}\n`);
    });
  }
}
