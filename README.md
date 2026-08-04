# @pipeworx/pubchem

PubChem MCP — NIH chemistry compound database, no auth.

Part of [Pipeworx](https://pipeworx.io) — an MCP gateway connecting AI agents to 1394+ live data sources.

## Tools

- `search_by_name(name, max_results?)` — name → CIDs.
- `get_compound(cid)` — formula, MW, SMILES, InChI, properties.
- `get_synonyms(cid, max_results?)` — all known names.
- `get_classification(cid)` — pharmacology classification tree.

## Data source

`https://pubchem.ncbi.nlm.nih.gov/rest/pug` (PUG-REST + PUG-VIEW). No key. Be reasonable on RPS (5/sec recommended).

## Quick Start

Add to your MCP client (Claude Desktop, Cursor, Windsurf, etc.):

```json
{
  "mcpServers": {
    "pubchem": {
      "url": "https://gateway.pipeworx.io/pubchem/mcp"
    }
  }
}
```

Or connect to the full Pipeworx gateway for access to all 1394+ data sources:

```json
{
  "mcpServers": {
    "pipeworx": {
      "url": "https://gateway.pipeworx.io/mcp"
    }
  }
}
```

## Using with ask_pipeworx

Instead of calling tools directly, you can ask questions in plain English:

```
ask_pipeworx({ question: "your question about Pubchem data" })
```

The gateway picks the right tool and fills the arguments automatically.

## More

- [Docs and guides](https://pipeworx.io/docs)
- [pipeworx.io](https://pipeworx.io)

## License

MIT
