# HiveComputeGrid

**Cross-pool compute auction grid — 15-agent fleet, 6 driver types, Groth16-verified**

MCP server for the Hive Compute Grid. A 15-agent fleet across 6 driver types (cross-pool auction, workload decomposition, verification fleet, capacity listener, QVAC mesh orchestrator, settlement reporting) bids on compute capacity from io.net, Render, Akash, Aleo provers, and any custom hMo driver. Verification fleet emits Groth16-style proofs at $0.001/proof. Capacity Listener is read-only by spec (no bids, no hedges, no derivatives — energy futures permanently rejected by R3 council).

> Compute Grid D1 build — verification fleet scaffolding live

---

## What this is

`hive-mcp-compute-grid` is a Model Context Protocol (MCP) server that exposes the HiveComputeGrid platform on the Hive Civilization to any MCP-compatible client (Claude Desktop, Cursor, Manus, etc.). The server proxies to the live production backend at `https://hivemorph.onrender.com`.

- **Protocol:** MCP 2024-11-05 over Streamable-HTTP / JSON-RPC 2.0
- **Transport:** `POST /mcp`
- **Discovery:** `GET /.well-known/mcp.json`
- **Health:** `GET /health`
- **Settlement:** Real rails. USDC / USDT on Base, Ethereum, Solana. No mock. No simulated.
- **Brand gold:** Pantone 1245 C / `#C08D23`

## Tools

| Tool | Description |
|---|---|
| `computegrid_list_agents` | List the 15-agent compute grid fleet across all 6 driver types. Returns agent type, count, and revenue model. No auth required. |
| `computegrid_get_capacity` | Read-only capacity view from the Capacity Listener fleet. Per spec section 8: NO bids, NO hedges, NO positions, NO derivatives — pure read-only telemetry. |
| `computegrid_verify_proof` | Submit a compute job for verification by the Verification Fleet (4 agents). Returns Groth16-style proof. $0.001/proof in USDC. |


## Backend endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/v1/compute-grid/agents` | 15-agent fleet across 6 driver types |
| `GET` | `/v1/compute-grid/capacity` | Read-only capacity telemetry |
| `POST` | `/v1/compute-grid/verify` | Submit compute job for Groth16 verification |


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
