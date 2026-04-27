#!/usr/bin/env node
/**
 * HiveComputeGrid MCP Server v1.1.0
 * Cross-pool compute auction grid — 15-agent fleet, 6 driver types, Groth16-verified.
 *
 * Backend: https://hivemorph.onrender.com
 * Spec   : MCP 2024-11-05 / Streamable-HTTP / JSON-RPC 2.0
 * Brand  : Hive Civilization gold #C08D23 (Pantone 1245 C)
 *
 * v1.1.0: 9 tools — adds /quote, /solve, /providers, /book, /status, /release,
 *                   /audit, /verify-selection on top of v1.0's list/capacity/verify.
 */

import express from 'express';
import { HIVE_EARN_TOOLS, executeHiveEarnTool, isHiveEarnTool } from './hive-earn-tools.js';
import { buildAgentCard, buildOacJsonLd, renderRootHtml } from './hive-agent-card.js';
import { renderLanding, renderRobots, renderSitemap, renderSecurity, renderOgImage, seoJson, BRAND_GOLD } from './meta.js';

const app = express();
app.use(express.json({ limit: '256kb' }));

const PORT = process.env.PORT || 3000;
const HIVE_BASE = process.env.HIVE_BASE || 'https://hivemorph.onrender.com';

// ─── Tool definitions ────────────────────────────────────────────────────────

// ─── Agent-native config (A2A AgentCard + OAC JSON-LD + earn rails) ───────
const HIVE_AGENT_CFG = {
  name: 'HiveComputeGrid MCP',
  description: "Cross-pool compute auction grid MCP server. Real io.net / Akash / Render adapters, Groth16-shaped selection proofs, signed receipts. Real Base USDC settlement.",
  url: 'https://hive-mcp-gateway.onrender.com/compute-grid',
  version: '1.1.2',
  repoUrl: 'https://github.com/srotzin/hive-mcp-compute-grid',
  did: 'did:hive:compute-grid',
  gatewayUrl: 'https://hive-mcp-gateway.onrender.com',
  // Tools attached at runtime (after merging earn tools in)
  tools: [],
};

const TOOLS = [
  {
    name: 'computegrid_list_agents',
    description:
      'List the 15-agent compute grid fleet across all 6 driver types (cross_pool_auction, workload_decomposition, verification_fleet, capacity_listener, qvac_mesh_orchestrator, settlement_reporting). Returns agent type, count, and revenue model. No auth required.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'computegrid_get_capacity',
    description:
      'Read-only capacity view from the Capacity Listener fleet. Per spec section 8: NO bids, NO hedges, NO positions, NO derivatives — pure read-only telemetry. Optional refresh=true triggers one upstream pull.',
    inputSchema: {
      type: 'object',
      properties: {
        n: { type: 'integer', description: 'Top-N rows to return (default 32, max 256)', minimum: 1, maximum: 256 },
        refresh: { type: 'boolean', description: 'Force a read-only refresh from the upstream Compute service' },
      },
    },
  },
  {
    name: 'computegrid_list_providers',
    description:
      'List enabled provider adapters (io.net, Akash, Render) and their upstream health. Returns required env vars for reservation paths. Real probes, no mocks.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'computegrid_quote',
    description:
      'Gather quotes across enabled compute providers WITHOUT running the auction (no proof, no ledger write). Useful for live price discovery on a workload.',
    inputSchema: {
      type: 'object',
      required: ['gpu_type', 'duration_hours'],
      properties: {
        gpu_type: { type: 'string', description: 'cpu | rtx_4090 | rtx_3090 | rtx_a6000 | a100 | h100 | l40s' },
        duration_hours: { type: 'number', description: 'Job duration in hours (>0)', exclusiveMinimum: 0 },
        cpu_cores: { type: 'integer', description: 'CPU cores (default 1)', minimum: 1 },
        ram_gb: { type: 'integer', description: 'RAM in GB (default 4)', minimum: 1 },
        budget_usd: { type: 'number', description: 'Optional budget cap in USD' },
      },
    },
  },
  {
    name: 'computegrid_solve',
    description:
      'Run the cross-pool auction. Returns chosen provider, all collected quotes, Groth16-shaped selection proof, signed verification receipt, settlement path. Persists cost_usdc telemetry to the Hive ledger by default.',
    inputSchema: {
      type: 'object',
      required: ['gpu_type', 'duration_hours'],
      properties: {
        gpu_type: { type: 'string', description: 'cpu | rtx_4090 | a100 | h100 | l40s | rtx_3090 | rtx_a6000' },
        duration_hours: { type: 'number', exclusiveMinimum: 0 },
        cpu_cores: { type: 'integer', minimum: 1 },
        ram_gb: { type: 'integer', minimum: 1 },
        budget_usd: { type: 'number', exclusiveMinimum: 0 },
        deadline_unix: { type: 'integer', description: 'Optional unix-second deadline; must be in the future' },
        job_id: { type: 'string' },
        submitter_did: { type: 'string', description: "DID of the submitting agent (e.g. 'did:hive:agent:foo')" },
        persist: { type: 'boolean', description: 'Write auction telemetry to ledger (default true)' },
      },
    },
  },
  {
    name: 'computegrid_book',
    description:
      'Reserve compute with the chosen provider after a /solve. Returns 503 with the missing-key error if the upstream provider key is not configured (real rails only — never fake a booking).',
    inputSchema: {
      type: 'object',
      required: ['auction_id', 'provider', 'quote', 'deadline_unix'],
      properties: {
        auction_id: { type: 'string' },
        provider: { type: 'string', enum: ['io_net', 'akash', 'render'] },
        quote: { type: 'object', description: 'Chosen Quote object from /solve.chosen_quote' },
        deadline_unix: { type: 'integer', exclusiveMinimum: 0 },
      },
    },
  },
  {
    name: 'computegrid_status',
    description:
      'Poll a provider booking by booking_id. Returns 503 until /book is wired with a real provider key. The 503 body documents which env var is required.',
    inputSchema: {
      type: 'object',
      required: ['booking_id'],
      properties: { booking_id: { type: 'string' } },
    },
  },
  {
    name: 'computegrid_release',
    description:
      'Release a provider reservation. Same gating as /book — 503 with documented missing-key error when the provider is not fully wired.',
    inputSchema: {
      type: 'object',
      required: ['provider', 'booking_id'],
      properties: {
        provider: { type: 'string', enum: ['io_net', 'akash', 'render'] },
        booking_id: { type: 'string' },
      },
    },
  },
  {
    name: 'computegrid_audit',
    description:
      'Read recent compute_grid_auction entries from the canonical receipt ledger — cost_usdc telemetry per cleared auction. Useful for treasury reconciliation and provenance audits.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'integer', minimum: 1, maximum: 200, description: 'Number of recent entries (default 20)' },
      },
    },
  },
  {
    name: 'computegrid_verify_proof',
    description:
      'Submit a Groth16 proof envelope + public inputs to the Verification Fleet (4 agents). Validates structure, signs an EIP-191 receipt with the Evaluator wallet. $0.001/proof in USDC.',
    inputSchema: {
      type: 'object',
      required: ['proof', 'public_inputs'],
      properties: {
        proof: { description: 'Groth16 proof envelope (dict {a,b,c} or 8-element list of BN254 field elements)' },
        public_inputs: { type: 'array', description: 'List of BN254 field elements (hex strings or ints)' },
        claim: { type: 'object', description: 'Optional claim metadata (model_id, job_id, output_hash, ...)' },
        proof_system: { type: 'string', description: "Proof system identifier (default 'groth16')" },
      },
    },
  },
  {
    name: 'computegrid_verify_selection',
    description:
      'Independently verify a selection proof envelope (e.g. from a prior /solve response). Returns the verifier’s signed receipt. Lets external auditors confirm an auction selection without trusting the broker.',
    inputSchema: {
      type: 'object',
      required: ['proof', 'public_inputs'],
      properties: {
        proof: { description: 'Groth16 envelope from /solve.proof_envelope' },
        public_inputs: { type: 'array', description: 'From /solve.proof_public_inputs' },
      },
    },
  },
];


const SERVICE_CFG = {
  service: "hive-mcp-compute-grid",
  shortName: "HiveComputeGrid",
  title: "HiveComputeGrid \u00b7 Cross-Pool Compute Auction MCP",
  tagline: "Solver auction across io.net / Akash / Render with signed receipts.",
  description: "MCP server for HiveComputeGrid \u2014 cross-pool compute auction grid. 11 tools, 15-agent fleet, 6 driver types. Real adapters for io.net, Akash, and Render. Groth16-shaped selection proofs, $0.001 per verification. USDC settlement on Base L2. Real rails, no mocks.",
  keywords: ["mcp", "model-context-protocol", "x402", "agentic", "ai-agent", "ai-agents", "llm", "hive", "hive-civilization", "compute-grid", "auction", "verification", "groth16", "io.net", "akash", "render", "usdc", "base", "base-l2", "a2a"],
  externalUrl: "https://hive-mcp-gateway.onrender.com/compute-grid",
  gatewayMount: "/compute-grid",
  version: "1.1.1",
  pricing: [
    { name: "computegrid_quote", priceUsd: 0, label: "Quote \u2014 free" },
    { name: "computegrid_solve", priceUsd: 0.001, label: "Solve auction (Tier 1)" },
    { name: "computegrid_book", priceUsd: 0.05, label: "Book reservation (Tier 3)" },
    { name: "computegrid_verify_proof", priceUsd: 0.001, label: "Verify proof (Tier 1)" }
  ],
};
SERVICE_CFG.tools = (typeof TOOLS !== 'undefined' ? TOOLS : (typeof MCP_TOOLS !== 'undefined' ? MCP_TOOLS : [])).map(t => ({ name: t.name, description: t.description }));

// HIVE_AGENT_NATIVE_v1 — earn tools + AgentCard wiring
for (const t of HIVE_EARN_TOOLS) {
  if (!TOOLS.find(x => x.name === t.name)) TOOLS.push(t);
}
HIVE_AGENT_CFG.tools = TOOLS;
// ─── HTTP helpers ────────────────────────────────────────────────────────────
async function hiveGet(path, params = {}) {
  const url = new URL(`${HIVE_BASE}${path.startsWith('/') ? path : '/' + path}`);
  Object.entries(params).forEach(([k, v]) => v != null && url.searchParams.set(k, v));
  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(20000) });
  let data; try { data = await res.json(); } catch { data = { raw: await res.text() }; }
  return { status: res.status, data };
}
async function hivePost(path, body, params = {}) {
  const url = new URL(`${HIVE_BASE}${path}`);
  Object.entries(params).forEach(([k, v]) => v != null && url.searchParams.set(k, v));
  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });
  let data; try { data = await res.json(); } catch { data = { raw: await res.text() }; }
  return { status: res.status, data };
}

function asText(payload) {
  return { type: 'text', text: JSON.stringify(payload, null, 2) };
}

// ─── Tool execution ──────────────────────────────────────────────────────────
async function executeTool(name, args) {
  // HIVE_AGENT_DISPATCH_v1 — earn tools first, then native dispatch
  if (isHiveEarnTool(name)) {
    const out = await executeHiveEarnTool(name, args);
    if (out) return out;
  }
  switch (name) {
    case 'computegrid_list_agents': {
      const { status, data } = await hiveGet('/v1/compute-grid/agents');
      return asText({ status, ...data });
    }
    case 'computegrid_get_capacity': {
      const { status, data } = await hiveGet('/v1/compute-grid/capacity', {
        n: args.n, refresh: args.refresh,
      });
      return asText({ status, ...data });
    }
    case 'computegrid_list_providers': {
      const { status, data } = await hiveGet('/v1/compute-grid/providers');
      return asText({ status, ...data });
    }
    case 'computegrid_quote': {
      const { status, data } = await hivePost('/v1/compute-grid/quote', {
        gpu_type: args.gpu_type,
        duration_hours: args.duration_hours,
        cpu_cores: args.cpu_cores,
        ram_gb: args.ram_gb,
        budget_usd: args.budget_usd,
      });
      return asText({ status, ...data });
    }
    case 'computegrid_solve': {
      const { persist, ...spec } = args;
      const { status, data } = await hivePost(
        '/v1/compute-grid/solve',
        spec,
        persist === false ? { persist: 'false' } : {},
      );
      return asText({ status, ...data });
    }
    case 'computegrid_book': {
      const { status, data } = await hivePost('/v1/compute-grid/book', {
        auction_id: args.auction_id,
        provider: args.provider,
        quote: args.quote,
        deadline_unix: args.deadline_unix,
      });
      return asText({ status, ...data });
    }
    case 'computegrid_status': {
      const { status, data } = await hiveGet('/v1/compute-grid/status', { booking_id: args.booking_id });
      return asText({ status, ...data });
    }
    case 'computegrid_release': {
      const { status, data } = await hivePost('/v1/compute-grid/release', {
        provider: args.provider,
        booking_id: args.booking_id,
      });
      return asText({ status, ...data });
    }
    case 'computegrid_audit': {
      const { status, data } = await hiveGet('/v1/compute-grid/audit', { limit: args.limit });
      return asText({ status, ...data });
    }
    case 'computegrid_verify_proof': {
      const { status, data } = await hivePost('/v1/compute-grid/verify', {
        proof: args.proof,
        public_inputs: args.public_inputs,
        claim: args.claim,
        proof_system: args.proof_system || 'groth16',
      });
      return asText({ status, ...data });
    }
    case 'computegrid_verify_selection': {
      const { status, data } = await hivePost('/v1/compute-grid/verify-selection', {
        proof: args.proof,
        public_inputs: args.public_inputs,
      });
      return asText({ status, ...data });
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// ─── MCP JSON-RPC handler ────────────────────────────────────────────────────
app.post('/mcp', async (req, res) => {
  const { jsonrpc, id, method, params } = req.body || {};
  if (jsonrpc !== '2.0') return res.json({ jsonrpc: '2.0', id, error: { code: -32600, message: 'Invalid JSON-RPC' } });
  try {
    switch (method) {
      case 'initialize':
        return res.json({
          jsonrpc: '2.0', id,
          result: {
            protocolVersion: '2024-11-05',
            capabilities: { tools: { listChanged: false } },
            serverInfo: {
              name: 'hive-mcp-compute-grid',
              version: '1.1.0',
              description: 'Cross-pool compute auction grid — 15-agent fleet, 6 driver types, Groth16-verified, real adapters (io.net/Akash/Render).',
            },
          },
        });
      case 'tools/list':
        return res.json({ jsonrpc: '2.0', id, result: { tools: TOOLS } });
      case 'tools/call': {
        const { name, arguments: args } = params || {};
        const out = await executeTool(name, args || {});
        return res.json({ jsonrpc: '2.0', id, result: { content: [out] } });
      }
      case 'ping':
        return res.json({ jsonrpc: '2.0', id, result: {} });
      default:
        return res.json({ jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } });
    }
  } catch (err) {
    return res.json({ jsonrpc: '2.0', id, error: { code: -32000, message: err.message } });
  }
});

// ─── Discovery + health ──────────────────────────────────────────────────────
app.get('/health', (req, res) => res.json({
  status: 'ok',
  service: 'hive-mcp-compute-grid',
  version: '1.1.0',
  backend: HIVE_BASE,
  tool_count: TOOLS.length,
}));
app.get('/.well-known/mcp.json', (req, res) => res.json({
  name: 'hive-mcp-compute-grid',
  version: '1.1.0',
  endpoint: '/mcp',
  transport: 'streamable-http',
  protocol: '2024-11-05',
  tools: TOOLS.map(t => ({ name: t.name, description: t.description })),
}));


// HIVE_META_BLOCK_v1 — comprehensive meta tags + JSON-LD + crawler discovery
app.get('/', (req, res) => {
  // HIVE_AGENT_INJECT_LD_v1 — inject OAC JSON-LD into the meta-tags landing
  const __landing = renderLanding(SERVICE_CFG);
  const __oacLd = JSON.stringify(buildOacJsonLd(HIVE_AGENT_CFG)).replace(/</g, '\\u003c');
  const __ldTag = '\n<script type="application/ld+json">' + __oacLd + '</script>\n';
  const __out = __landing.replace('</head>', __ldTag + '</head>');
  res.type('text/html; charset=utf-8').send(__out);
});
app.get('/og.svg', (req, res) => {
  res.type('image/svg+xml').send(renderOgImage(SERVICE_CFG));
});
app.get('/robots.txt', (req, res) => {
  res.type('text/plain').send(renderRobots(SERVICE_CFG));
});
app.get('/sitemap.xml', (req, res) => {
  res.type('application/xml').send(renderSitemap(SERVICE_CFG));
});
app.get('/.well-known/security.txt', (req, res) => {
  res.type('text/plain').send(renderSecurity());
});
app.get('/seo.json', (req, res) => res.json(seoJson(SERVICE_CFG)));
// HIVE_AGENT_ROUTES_v1 — A2A AgentCard + OAC JSON-LD
app.get('/.well-known/agent.json', (req, res) => {
  res.json(buildAgentCard(HIVE_AGENT_CFG));
});
app.get('/agent.json', (req, res) => {
  res.json(buildAgentCard(HIVE_AGENT_CFG));
});
app.get('/.well-known/oac.json', (req, res) => {
  res.json(buildOacJsonLd(HIVE_AGENT_CFG));
});
app.get('/agent.html', (req, res) => {
  res.type('text/html; charset=utf-8').send(renderRootHtml(HIVE_AGENT_CFG));
});

app.listen(PORT, () => {
  console.log(`HiveComputeGrid MCP Server v1.1.0 running on :${PORT}`);
  console.log(`  Backend : ${HIVE_BASE}`);
  console.log(`  Tools   : ${TOOLS.length}`);
});
