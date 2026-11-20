# LaunchScope — the token launch radar

A token launch radar for make.fun's token-radar-01 bounty. LaunchScope reads one sealed DefiLlama
snapshot (758 protocols) and ranks **every protocol that still records no token** (342) by the implied
value of the token it may one day launch, then hands the reader a dashboard: the ranked board, a
detail view for each protocol that audits its number factor by factor, filters and five sort orders,
and a concrete farm plan per protocol.

## The model

Implied value is computed only from the snapshot's own figures — no protocol name is ever
special-cased:

    implied = TVL x peer multiple x momentum x maturity x issuance factor

1. **Peer multiple** — the median market-cap/TVL of the category's protocols whose token already
   trades, shrunk toward the snapshot-wide median (0.205) by sample size.
2. **Momentum** — `exp(clamp(change_7d, -40, 60) / 100 x 0.9)` on seven-day TVL growth.
3. **Maturity** — `0.85 + 0.3 x (1 - exp(-age_years / 2.5))` on the years tracked with no token.
4. **Issuance factor** — `0.35 + 0.65 x prior`, where the prior is the Laplace-smoothed share of the
   category's protocols that ever issued a token, counted from this snapshot.

Protocols whose token already trades are never ranked; the dashboard shows the largest of them in a
reference tab at the market's own values — they are the evidence the board is priced from.

## Run it

    mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <path-to-snapshot.json>

Writes `board.json`, `data.js`, `dashboard/`, `screenshots/` and `dossier.json` into the output
directory. Node 22, standard library only, no network.

## Layout

- `main.ts` — the entrypoint: snapshot in, board + dashboard data + dossier out.
- `lib/model.ts` — the LaunchScope model, the farm-plan playbooks, and the board's gate checks.
- `dashboard/` — the static page (index.html, app.css, app.js); renders fully offline from `data.js`.
- `screenshots/` — the board, a protocol detail view, and a filtered view.
- `vendor/makefun-board.ts` — the kit's dossier library, vendored as the bounty requires.

## License

MIT (see LICENSE).
