#!/usr/bin/env node
/**
 * HiveComputeGrid MCP Server
 * Cross-pool compute auction grid — 15-agent fleet, 6 driver types, Groth16-verified
 *
 * Backend: https://hivemorph.onrender.com
 * Spec   : MCP 2024-11-05 / Streamable-HTTP / JSON-RPC 2.0
 * Brand  : Hive Civilization gold #C08D23 (Pantone 1245 C)
 */

import express from 'express';

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const HIVE_BASE = process.env.HIVE_BASE || 'https://hivemorph.onrender.com';

// ─── Tool definitions ────────────────────────────────────────────────────────
const TOOLS = [
{
  name: 'computegrid_list_agents',
  description: 'List the 15-agent compute grid fleet across all 6 driver types. Returns agent type, count, and revenue model. No auth required.',
  inputSchema: {
    type: 'object',
    properties: {

    },
  },
},{
  name: 'computegrid_get_capacity',
  description: 'Read-only capacity view from the Capacity Listener fleet. Per spec section 8: NO bids, NO hedges, NO positions, NO derivatives — pure read-only telemetry.',
  inputSchema: {
    type: 'object',
    properties: {

    },
  },
},    {
      name: 'computegrid_verify_proof',
      description: 'Submit a compute job for verification by the Verification Fleet (4 agents). Returns Groth16-style proof. $0.001/proof in USDC.',
      inputSchema: {
type: 'object',
required: ["job_id", "driver", "claimed_output_hash", "submitter_did"],
properties: {
  job_id: { type: 'string', description: 'Job ID to verify' },
  driver: { type: 'string', description: 'Source driver: ionet | render | akash | aleo | custom' },
  claimed_output_hash: { type: 'string', description: 'SHA-256 of claimed output' },
  submitter_did: { type: 'string', description: 'DID of the submitting agent' }
},
      },
    }
];

// ─── HTTP helpers ────────────────────────────────────────────────────────────
async function hiveGet(path, params = {}) {
  const url = new URL(`${HIVE_BASE}${path.startsWith('/') ? path : '/' + path}`);
  Object.entries(params).forEach(([k, v]) => v != null && url.searchParams.set(k, v));
  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(15000) });
  return res.json();
}
async function hivePost(path, body) {
  const res = await fetch(`${HIVE_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  let data; try { data = await res.json(); } catch { data = { raw: await res.text() }; }
  return { data, status: res.status };
}

// ─── Tool execution ──────────────────────────────────────────────────────────
async function executeTool(name, args) {
  switch (name) {
      case 'computegrid_list_agents': {
const data = await hiveGet('/v1/compute-grid/agents');
return { type: 'text', text: JSON.stringify(data, null, 2) };
      }
      case 'computegrid_get_capacity': {
const data = await hiveGet('/v1/compute-grid/capacity');
return { type: 'text', text: JSON.stringify(data, null, 2) };
      }
      case 'computegrid_verify_proof': {
const { data, status } = await hivePost('/v1/compute-grid/verify', {
  job_id: args.job_id,
  driver: args.driver,
  claimed_output_hash: args.claimed_output_hash,
  submitter_did: args.submitter_did
});
return { type: 'text', text: JSON.stringify({ status, ...data }, null, 2) };
      }
      default:
        throw new Error(`Unknown tool: ${name}`);
  }
}

// ─── MCP JSON-RPC handler ────────────────────────────────────────────────────
app.post('/mcp', async (req, res) => {
  const { jsonrpc, id, method, params } = req.body || {};
  if (jsonrpc !== '2.0') return res.json({ jsonrpc:'2.0', id, error: { code:-32600, message:'Invalid JSON-RPC' } });
  try {
    switch (method) {
      case 'initialize':
        return res.json({ jsonrpc:'2.0', id, result: {
          protocolVersion: '2024-11-05',
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: 'hive-mcp-compute-grid', version: '1.0.0', description: 'Cross-pool compute auction grid — 15-agent fleet, 6 driver types, Groth16-verified' },
        } });
      case 'tools/list':
        return res.json({ jsonrpc:'2.0', id, result: { tools: TOOLS } });
      case 'tools/call': {
        const { name, arguments: args } = params || {};
        const out = await executeTool(name, args || {});
        return res.json({ jsonrpc:'2.0', id, result: { content: [out] } });
      }
      case 'ping':
        return res.json({ jsonrpc:'2.0', id, result: {} });
      default:
        return res.json({ jsonrpc:'2.0', id, error: { code:-32601, message:`Method not found: ${method}` } });
    }
  } catch (err) {
    return res.json({ jsonrpc:'2.0', id, error: { code:-32000, message: err.message } });
  }
});

// ─── Discovery + health ──────────────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ status:'ok', service:'hive-mcp-compute-grid', version:'1.0.0', backend: HIVE_BASE }));
app.get('/.well-known/mcp.json', (req, res) => res.json({
  name: 'hive-mcp-compute-grid',
  endpoint: '/mcp',
  transport: 'streamable-http',
  protocol: '2024-11-05',
  tools: TOOLS.map(t => ({ name: t.name, description: t.description })),
}));

app.listen(PORT, () => {
  console.log(`HiveComputeGrid MCP Server running on :${PORT}`);
  console.log(`  Backend : ${HIVE_BASE}`);
  console.log(`  Tools   : ${TOOLS.length}`);
});
