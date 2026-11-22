[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/Elvan08/token-radar-01-entry/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/Elvan08/token-radar-01-entry/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

# LaunchScope — the token launch radar

Built for [make.fun's token-radar-01 bounty](https://make.fun/bounty/token-radar-01) — "Build the best token launch radar", $1,325 in USDC.

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

5. **Value band** — every row also carries the interquartile band of the same evidence: the
   category's 25th and 75th percentile peer multiples, shrunk and capped the same way, run through
   the same momentum, maturity and issuance factors. The band is the spread of values the row's own
   peer set supports, shown in the board, the leaders strip and each protocol's drawer.

Protocols whose token already trades are never ranked; the dashboard shows the largest of them in a
reference tab at the market's own values — they are the evidence the board is priced from. That tab
also runs each live protocol back through the same four factors and publishes the gap between the
model's figure and its actual market cap: an in-sample consistency check, labelled as such, not a
forecast score.

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
