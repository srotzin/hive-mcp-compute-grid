# HiveComputeGrid

**Cross-pool compute auction grid — 15-agent fleet, 6 driver types, Groth16-verified**

MCP server for the Hive Compute Grid. A 15-agent fleet across 6 driver types (cross-pool auction, workload decomposition, verification fleet, capacity listener, QVAC mesh orchestrator, settlement reporting) bids on compute capacity from io.net, Render, Akash, Aleo provers, and any custom hMo driver. Verification fleet emits Groth16-style proofs at $0.001/proof. Capacity Listener is read-only by spec (no bids, no hedges, no derivatives — energy futures permanently rejected by R3 council).

> Compute Grid **D2 build (v1.1.0)** — real auction solver + io.net/Akash/Render adapters live, Groth16-shaped selection proofs, cost telemetry to canonical receipt ledger.

---

## What this is

`hive-mcp-compute-grid` is a Model Context Protocol (MCP) server that exposes the HiveComputeGrid platform on the Hive Civilization to any MCP-compatible client (Claude Desktop, Cursor, Manus, etc.). The server proxies to the live production backend at `https://hivemorph.onrender.com`.

- **Protocol:** MCP 2024-11-05 over Streamable-HTTP / JSON-RPC 2.0
- **Transport:** `POST /mcp`
- **Discovery:** `GET /.well-known/mcp.json`
- **Health:** `GET /health`
- **Settlement:** Real rails. USDC / USDT on Base, Ethereum, Solana. No mock. No simulated.
- **Brand gold:** Pantone 1245 C / `#C08D23`

## Tools (v1.1.0 — 11 tools)

| Tool | Description |
|---|---|
| `computegrid_list_agents` | List the 15-agent fleet across all 6 driver types. |
| `computegrid_get_capacity` | Read-only capacity view from the Capacity Listener fleet. |
| `computegrid_list_providers` | List enabled provider adapters (io.net, Akash, Render) and their upstream health. |
| `computegrid_quote` | Gather quotes across enabled providers WITHOUT running the auction (price discovery). |
| `computegrid_solve` | Run the cross-pool auction. Returns chosen provider, all quotes, Groth16-shaped selection proof, signed receipt, settlement path. Persists cost_usdc telemetry to the Hive ledger. |
| `computegrid_book` | Reserve compute with the chosen provider (gated on provider keys; 503 with documented missing-key error if not configured). |
| `computegrid_status` | Poll a provider booking by id. |
| `computegrid_release` | Release a reservation. |
| `computegrid_audit` | Read recent compute_grid_auction entries from the canonical receipt ledger. |
| `computegrid_verify_proof` | Submit any Groth16 proof envelope to the Verification Fleet ($0.001/proof). |
| `computegrid_verify_selection` | Independently verify a selection proof from a prior `/solve` response. |


## Backend endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET`  | `/v1/compute-grid/agents` | 15-agent fleet across 6 driver types |
| `GET`  | `/v1/compute-grid/capacity` | Read-only capacity telemetry |
| `GET`  | `/v1/compute-grid/providers` | Enabled adapters + upstream health |
| `POST` | `/v1/compute-grid/quote` | Gather quotes without running auction |
| `POST` | `/v1/compute-grid/solve` | Run cross-pool auction → proof + receipt + settlement |
| `POST` | `/v1/compute-grid/book` | Reserve compute (gated on provider keys) |
| `GET`  | `/v1/compute-grid/status` | Poll booking status |
| `POST` | `/v1/compute-grid/release` | Release reservation |
| `GET`  | `/v1/compute-grid/audit` | Read recent auction telemetry |
| `POST` | `/v1/compute-grid/verify` | Verify any Groth16 proof |
| `POST` | `/v1/compute-grid/verify-selection` | Independent verifier for selection proofs |


## Run locally

```bash
git clone https://github.com/srotzin/hive-mcp-compute-grid.git
cd hive-mcp-compute-grid
npm install
npm start
# server up on http://localhost:3000/mcp
curl http://localhost:3000/health
curl http://localhost:3000/.well-known/mcp.json
```

## Connect from an MCP client

**Claude Desktop / Cursor / Manus** — add to your `mcp.json`:

```json
{
  "mcpServers": {
    "hive_mcp_compute_grid": {
      "command": "npx",
      "args": ["-y", "mcp-remote@latest", "https://your-deployed-host/mcp"]
    }
  }
}
```

## Hive Civilization

Part of the [Hive Civilization](https://www.thehiveryiq.com) — sovereign DID, USDC settlement, HAHS legal contracts, agent-to-agent rails.

Categories: compute, depin, agent-to-agent, infrastructure, verification, web3.

## License

MIT (c) Steve Rotzin / Hive Civilization
