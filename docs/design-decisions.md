# Design decisions

This is the entry point to durable cross-cutting choices, not a second live architecture or a progress log. [Architecture](architecture.md) describes current boundaries; existing ADRs keep their identities and detailed rationale.

| Decision | Authoritative record |
| --- | --- |
| GitHub-first persistence; Local is a development adapter | [ADR 0001](adr/0001-persistence-github-first.md) |
| Shared file contract, source preservation, JSON priority and alias expansion | [ADR 0002](adr/0002-keymap-file-contract.md) |
| Server-held GitHub OAuth credentials and opaque browser session | [ADR 0003](adr/0003-github-auth-server-session.md) |
| Alt+click host editing and separate OS deliverables | [ADR 0004](adr/0004-host-edit-and-os-deliverables.md) |
| Host snapshot/deliverables co-committed with firmware | [ADR 0005](adr/0005-host-keymap-github-snapshot.md) |

## Record authority

Adopt the DOX/CAP/CHG maintenance model without replacing the product architecture. CAPs describe existing, executable-test-backed behavior; active CHGs alone track implementation progress. Completed CHGs are receipts. Canonical visuals describe current human-facing capabilities, not pending feature promises.

This follows the direct operator request: “Incorporate the ../ai-software-blueprint/ into this project. Proceed with the feature gaps as proposed in change requests based on the new blueprint”. Existing project guidance and ADRs remain in force. No adoption-only product CAP or completed feature CHG is fabricated.

For future irreversible runtime, authentication, permission, persistence, or privacy choices, add the next ADR and index it here. Capability-local rules belong in the relevant CAP; temporary implementation reasoning belongs in its CHG.
