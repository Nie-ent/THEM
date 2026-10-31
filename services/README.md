# services (phase 4+)

Go 1.24 module `github.com/nie-ent/them/services`. Phase 1 ships only a skeleton.

## Plan

| Service | Language | Role |
| --- | --- | --- |
| `cmd/gateway` | Go | Public HTTP/WebSocket entry, auth, routing. Today: `GET /healthz` only. |
| `cmd/matchmaking` | Go | Queues, ranked brackets (star-sum limit), lobby assembly. |
| `cmd/chat` | Go | Channels, guild chat, moderation hooks. |
| `cmd/rooms` | Go | Co-op/raid room lifecycle, relays inputs between players. |
| sim workers | Node 22 | Run `packages/core` (the same deterministic TypeScript sim the client runs). |

Go owns concurrency-heavy networking. The game simulation is **not** re-implemented in Go: Go
services call a pool of Node workers over gRPC (`proto/sim.proto`), which replay seed + input logs
through `@them/core` to verify ranked scores and to host authoritative co-op rooms. This keeps one
source of truth for game rules.

## Commands

```sh
go run ./cmd/gateway      # THEM_GATEWAY_ADDR=:8080 by default
go test ./...
```

`proto/` is a placeholder; code generation (buf / protoc-gen-go / ts-proto) arrives in phase 4.
