// LaunchScope: a token launch radar built on one sealed DefiLlama snapshot.
//
// The board ranks every standalone protocol in the snapshot that still records no token (256 of
// 758), not just the 40-name watchlist: the watchlist is the floor the gate checks, never the
// ceiling of the radar. Two sets are kept apart from the ranking, on the snapshot's own lines:
// protocols whose token already trades (shown in a live set at the market's own values — they are
// what the board is priced against), and the 86 wrapped or staked products of an asset that
// already trades (categories Bridge, Canonical Bridge, Liquid Staking, Liquid Restaking and
// Restaked BTC — the same line the snapshot's watchlist rule draws): a wrapped bitcoin does not
// launch a second bitcoin, so it is counted and named, never ranked as a future launch.
//
// The implied value of a pre-token protocol is read off the snapshot's own figures, in four moves:
//
//   1. Peer multiple. Protocols in the same category whose token already trades reveal what the
//      market pays per dollar of TVL in that category: the median mcap/TVL of the category's
//      tokenized protocols, shrunk toward the snapshot-wide median (0.205) by sample size, so a
//      category with two thin peers cannot shout down the whole market's evidence. The multiple
//      is winsorised at the 90th percentile of every tokenized ratio in the snapshot: a category
//      whose few trading peers hold almost no TVL (prediction markets) would otherwise price a
//      $300M protocol above every exchange on the board, and a cap read from the same data keeps
//      one thin category from owning the ranking.
//   2. Momentum. Seven-day TVL growth compounds into the multiple on an exponential curve:
//      exp(clamp(change_7d, -40, 60) / 100 x 0.9), so a protocol adding TVL fast is worth more
//      than a shrinking one with the same stock of TVL, and one bad week cannot zero it.
//   3. Maturity. A protocol tracked for years with no token has a proven product and a proven
//      habit of not issuing; the curve 0.85 + 0.3 x (1 - exp(-age_years / 2.5)) pays up to +15%
//      for that track record and starts a newborn at 0.85. A protocol with no listing date
//      published gets no tenure credit at all — maturity stays at the 0.85 base — because the
//      model cannot verify how long it has run with no token, and an unverified year is not
//      worth the same as a proven one.
//   4. Issuance prior. The share of a category's protocols that ever issued a token, counted
//      from this snapshot with Laplace smoothing, softened to a factor of 0.35 + 0.65 x prior:
//      a lending market prices like its tokenized peers, while a centralised exchange that has
//      never issued is discounted for the chance it never will.
//
//   implied = round(tvl x peer_multiple x momentum x maturity x issuance_factor)
//
// No protocol name is ever special-cased: one function scores every row from its figures alone,
// and the dashboard shows each row's four factors so a reader can audit the number end to end.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, as the dashboard states them. */
export interface ModelConstants {
  shrink_peers: number;
  momentum_weight: number;
  momentum_floor_pct: number;
  momentum_cap_pct: number;
  maturity_base: number;
  maturity_range: number;
  maturity_tau_years: number;
  issuance_base: number;
  issuance_range: number;
}

export const MODEL: ModelConstants = {
  shrink_peers: 4,
  momentum_weight: 0.9,
  momentum_floor_pct: -40,
  momentum_cap_pct: 60,
  maturity_base: 0.85,
  maturity_range: 0.3,
  maturity_tau_years: 2.5,
  issuance_base: 0.35,
  issuance_range: 0.65,
};

/** The model's version label: the dashboard names it. */
export const MODEL_VERSION = 'launchscope-5';

/** How many live-token protocols the Live view carries, by market cap. */
export const LIVE_ROWS = 24;

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  model: {
    peer_multiple: number;
    momentum_multiplier: number;
    maturity_multiplier: number;
    issuance_factor: number;
    age_days: number | null;
  };
  farm_steps: string[];
  farm_summary: string;
  /** One or two sentences of peer context: category size, tokenized share, median multiple, TVL rank. */
  peer_note: string;
}

/** The dashboard's view of one board row, with the model breakdown and the farm plan. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  peer_multiple: number;
  momentum_multiplier: number;
  maturity_multiplier: number;
  issuance_factor: number;
  watchlist: boolean;
  farm_steps: string[];
  farm_summary: string;
  peer_note: string;
}

/** A live-token protocol: it already trades, so the board shows the market's own value. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** Everything the dashboard needs: the board, the live set, and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  global_median_multiple: number;
  total_protocols: number;
  products_size: number;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** Whole days from `listedAt` to `asOf`, clamped at zero; null when a date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const from = Date.parse(`${listedAt}T00:00:00Z`);
  const to = Date.parse(`${asOf}T00:00:00Z`);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return null;
  return Math.max(0, Math.round((to - from) / DAY_MS));
}

/** A protocol is pre-token when the snapshot records no token for it at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.gecko_id === null && p.symbol === null && p.mcap_usd === null;
}

/**
 * Categories that are wrapped or staked products of an asset that already trades — the same list
 * the snapshot's watchlist rule uses. Their value already trades through the parent asset, so the
 * board counts and names them but never ranks them as future launches.
 */
export const PRODUCT_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC']);

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** The q-quantile of a set of ratios, nearest-rank; used to winsorise the peer multiple. */
function quantile(values: number[], q: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]!;
}

function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value));
}

/** Per-category market evidence, counted from the snapshot's tokenized protocols. */
export interface CategoryEvidence {
  /** Median mcap/TVL of the category's tokenized protocols, shrunk toward the global median. */
  peerMultiple: number;
  /** How many tokenized peers priced the category (0 when none did). */
  peers: number;
  /** Laplace-smoothed share of the category that has ever issued a token. */
  issuancePrior: number;
  /** Every protocol in the category, tokenized or not. */
  members: number;
  /** How many of the category's protocols already trade a token. */
  tokenized: number;
  /** Raw median mcap/TVL of the category's tokenized protocols (the global median when none did). */
  medianMultiple: number;
}

/** Build the category evidence table from the snapshot alone. */
export function categoryEvidence(snapshot: Snapshot, model: ModelConstants): Map<string, CategoryEvidence> {
  const ratiosByCat = new Map<string, number[]>();
  const allRatios: number[] = [];
  const totals = new Map<string, { all: number; tokenized: number }>();
  for (const p of snapshot.protocols) {
    const cat = p.category ?? 'Uncategorised';
    const t = totals.get(cat) ?? { all: 0, tokenized: 0 };
    t.all += 1;
    if (!isPreToken(p)) {
      t.tokenized += 1;
      if (p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0) {
        const ratio = p.mcap_usd / p.tvl_usd;
        allRatios.push(ratio);
        const list = ratiosByCat.get(cat) ?? [];
        list.push(ratio);
        ratiosByCat.set(cat, list);
      }
    }
    totals.set(cat, t);
  }
  const globalMedian = allRatios.length > 0 ? median(allRatios) : 0.2;
  const multipleCap = allRatios.length > 0 ? quantile(allRatios, 0.9) : 3;
  const out = new Map<string, CategoryEvidence>();
  for (const [cat, t] of totals) {
    const ratios = ratiosByCat.get(cat) ?? [];
    const catMedian = ratios.length > 0 ? median(ratios) : globalMedian;
    const shrunk = (ratios.length * catMedian + model.shrink_peers * globalMedian) / (ratios.length + model.shrink_peers);
    const peerMultiple = Math.min(shrunk, multipleCap);
    out.set(cat, {
      peerMultiple,
      peers: ratios.length,
      issuancePrior: (t.tokenized + 1) / (t.all + 2),
      members: t.all,
      tokenized: t.tokenized,
      medianMultiple: catMedian,
    });
  }
  return out;
}

/** The four factors and the implied value of one pre-token protocol. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  evidence: CategoryEvidence,
  model: ModelConstants,
): { implied: number; peerMultiple: number; momentum: number; maturity: number; issuance: number; age: number | null } {
  const age = ageDays(asOf, protocol.listed_at);
  const growthPct = protocol.change_7d === null ? 0 : clamp(protocol.change_7d, model.momentum_floor_pct, model.momentum_cap_pct);
  const momentum = Math.exp((growthPct / 100) * model.momentum_weight);
  // No listing date, no tenure credit: an unknown age is scored at the maturity base, never
  // at the one-year credit the old code gave it by default.
  const maturity = age === null ? model.maturity_base : model.maturity_base + model.maturity_range * (1 - Math.exp(-(age / 365) / model.maturity_tau_years));
  const issuance = model.issuance_base + model.issuance_range * evidence.issuancePrior;
  const implied = Math.max(1, Math.round(protocol.tvl_usd * evidence.peerMultiple * momentum * maturity * issuance));
  return { implied, peerMultiple: evidence.peerMultiple, momentum, maturity, issuance, age };
}

function money(usd: number): string {
  if (usd >= 1_000_000_000) return `$${(usd / 1_000_000_000).toFixed(1)}B`;
  if (usd >= 1_000_000) return `$${(usd / 1_000_000).toFixed(0)}M`;
  if (usd >= 1_000) return `$${(usd / 1_000).toFixed(0)}K`;
  return `$${usd}`;
}

/**
 * The farm plan for one protocol: concrete steps with costs and times, written from its category
 * playbook and its own figures (chains, TVL tier, age). Every step names an action a reader can
 * take this week, what it costs in gas or capital lock-up, and how long it runs.
 */
export function farmPlan(p: SnapshotProtocol, asOf: string): string[] {
  const cat = p.category ?? 'Protocol';
  const chain = p.chains[0] ?? 'its main chain';
  const chain2 = p.chains[1] ?? chain;
  const age = ageDays(asOf, p.listed_at);
  const ageText = age === null ? 'a track record DefiLlama already follows' : `${Math.floor(age / 30)}+ months tracked on DefiLlama`;
  const tier = p.tvl_usd >= 1_000_000_000 ? 'a top-tier position ($1,000-$5,000)' : p.tvl_usd >= 100_000_000 ? 'a mid position ($250-$1,000)' : 'a starter position ($50-$250)';
  const open = `Open the ${p.name} app on ${chain} and connect a fresh wallet you use only for farming; ${p.name} holds ${money(p.tvl_usd)} of TVL with ${ageText}, so early-user snapshots are the realistic route to any launch allocation. Cost: $0, 10 minutes.`;
  const momentum =
    p.change_7d !== null && p.change_7d >= 5
      ? `TVL rose ${p.change_7d.toFixed(1)}% in 7 days — the growth is already happening, so enter at the top of ${tier} this week instead of waiting for a launch announcement; fast-growing protocols snapshot their early users before the crowd arrives. Cost: gas only on top of the deposit, 15 minutes.`
      : p.change_7d !== null && p.change_7d <= -10
        ? `TVL fell ${Math.abs(p.change_7d).toFixed(1)}% in 7 days — size smaller: size the first deposit at the bottom of ${tier} and split it into two tranches a month apart; a falling TVL can mean rotation out, so prove the position in stages instead of going all-in on a cooling protocol. Cost: gas only, 10 minutes per tranche.`
        : `TVL ${p.name} ${p.change_7d === null ? 'has no 7-day change published' : `moved ${p.change_7d >= 0 ? '+' : ''}${p.change_7d.toFixed(1)}% in 7 days — no strong momentum either way`}, so stick to the standard ${tier} sizing and let the 60-90 day hold do the work; flat TVL means the snapshot, when it comes, will reward tenure over timing. Cost: $0, passive.`;
  const review = `Check the ${p.name} app and its official X account weekly for a points or season program, and keep a dated log of every action (tx hashes, amounts, dates) in a spreadsheet; week-one entrants earn the launch multiplier, and a dated log lets you prove history in minutes if a snapshot is announced. Cost: $0, 5 minutes a week.`;
  const playbooks: Record<string, string[]> = {
    'Lending': [
      `Supply ${tier} of a blue-chip asset (ETH or a major stablecoin) on ${p.name} on ${chain}; lending supply is the balance most launch snapshots weight heaviest. Gas: about $1-$5 on ${chain}, 15 minutes to set up.`,
      `Borrow a small amount (20-30% of your supply) and repay it within a week, twice, so the wallet shows both sides of the market without risking liquidation. Cost: interest of a few dollars, 10 minutes per cycle.`,
      `Hold the position for at least 60-90 days and add a small top-up monthly; duration-weighted snapshots punish wallets that deposit for a single week. Running cost: gas only, about $2 a month.`,
    ],
    'Dexs': [
      `Swap ${tier} of volume on ${p.name} on ${chain} across at least 8 separate days, using real trades you would make anyway; one-day volume spikes are the first thing sybil filters cut. Gas and fees: roughly 0.1-0.3% of volume.`,
      `Provide liquidity to the deepest ${p.name} pool on ${chain2} with $200-$1,000 and leave it for 60+ days; LP tenure is the metric most DEX launches reward after volume. Cost: impermanent-loss risk on the pair, 20 minutes to open.`,
      `Vote or stake in any ${p.name} governance or fee-sharing trial it runs before launch; governance participation is cheap now and expensive to fake later. Cost: gas only, 10 minutes.`,
    ],
    'Derivatives': [
      `Open small perpetual positions on ${p.name} on ${chain} totalling ${tier} of notional over at least 6 different days; open interest days, not one big trade, are what perps launches count. Fees: about 0.05-0.1% per open and close.`,
      `Post margin and hold one position open through a full funding cycle (8-24 hours) so the wallet records real risk, not just flow. Cost: funding of a few dollars, mostly passive.`,
      `Use one advanced feature (limit order, stop, or cross-margin) once; feature breadth is a common tie-breaker in derivatives airdrop formulas. Cost: $0 beyond normal fees, 10 minutes.`,
    ],
    'Liquid Staking': [
      `Stake ${tier} of ETH (or the chain's gas token) through ${p.name} on ${chain} and hold the liquid staking token in the same wallet; staked balance x days held is the standard formula. Gas: about $2-$8 on mainnet, cheaper on ${chain2}.`,
      `Use the ${p.name} staking token in one partner protocol (lend it or LP it) so the wallet shows composability, which restaking-era snapshots often bonus. Cost: gas only, 15 minutes.`,
      `Do not unstake before any announced snapshot date; exit queues of 7-21 days mean a late exit can miss the cut entirely. Cost: patience, $0.`,
    ],
    'Restaking': [
      `Restake ${tier} of a liquid staking token through ${p.name} on ${chain}; points in restaking accrue per dollar per day, so entering this month beats entering at the announcement. Gas: about $3-$10.`,
      `Pick one actively validated service inside ${p.name} and delegate to it; delegation choices are recorded and sometimes rewarded separately. Cost: $0, 10 minutes.`,
      `Claim and compound any points or rewards ${p.name} issues monthly so the wallet's history shows continuous activity across the whole season. Cost: small gas, 5 minutes a month.`,
    ],
    'Yield': [
      `Deposit ${tier} into the flagship ${p.name} vault on ${chain} and keep it there for a full quarter; yield vaults snapshot average balances, so steady money beats big money that leaves. Gas: about $1-$6.`,
      `Split a second, smaller deposit into a different ${p.name} vault on ${chain2} so the wallet appears in two strategy snapshots, not one. Cost: gas only, 10 minutes.`,
      `Harvest or compound the yield at least twice; wallets that never touch their position read as abandoned in most scoring models. Cost: gas only, 5 minutes each time.`,
    ],
    'Yield Aggregator': [
      `Deposit ${tier} into a ${p.name} vault on ${chain} and leave it compounding for 90 days; aggregator launches reward balance duration above almost everything. Gas: about $1-$5.`,
      `Move a small position between two ${p.name} strategies once, after 30 days, to record an active management action. Cost: gas only, 10 minutes.`,
      `Keep the vault share token in the farming wallet (do not LP it away) so balance snapshots read the full position. Cost: $0.`,
    ],
    'CDP': [
      `Mint a small stablecoin loan from ${p.name} on ${chain} against ${tier} of ETH collateral at a conservative 250%+ ratio; CDP launches count vaults that stayed healthy through volatility. Gas: about $3-$10 on mainnet.`,
      `Hold the minted stablecoin or deposit it back into ${p.name}'s stability pool so both sides of the system record your wallet. Cost: $0 beyond gas, 10 minutes.`,
      `Top up collateral once after a market dip instead of closing; surviving a drawdown is the behaviour these snapshots are built to find. Cost: capital on standby, 5 minutes when needed.`,
    ],
    'Bridge': [
      `Bridge ${tier} to ${chain2} through ${p.name} on two separate weeks; bridge launches weight distinct active days and total routed volume. Fees: about 0.05-0.2% plus gas.`,
      `Bridge back once instead of only arriving; round-trip wallets are a minority and several past bridge airdrops bonused them. Cost: same fees again, 10 minutes.`,
      `Hold some of the bridged funds on the destination chain for 30+ days rather than returning everything the same day. Cost: $0, passive.`,
    ],
    'Canonical Bridge': [
      `Bridge ${tier} to ${chain} through ${p.name} and keep the funds working there (in a lending market or DEX) for at least 30 days; canonical bridges snapshot balances held on their chain. Cost: L1 gas of $2-$10.`,
      `Bridge a second, smaller amount a month later so the wallet shows two distinct active months. Cost: L1 gas again, 10 minutes.`,
      `Use the chain's native apps weekly while the funds sit there; chain-level activity is what a canonical bridge's token would reward. Cost: small gas on the destination chain.`,
    ],
    'CEX': [
      `Complete ${p.name} KYC on one account only and make a first spot trade of $100+; exchange tokens, when they come, go to verified accounts with real trading history, never to multi-account farms. Cost: $0 beyond trading fees, 20 minutes.`,
      `Trade modestly every month (even $50 of volume) and hold a small balance on ${p.name} so the account reads as a retained customer, not a signup bonus hunter. Cost: normal fees, 10 minutes a month.`,
      `Join any ${p.name} launchpool or earn program with a small stake; participation lists are the closest thing an exchange has to a public points ledger. Cost: capital locked 7-30 days.`,
    ],
    'RWA': [
      `Buy ${tier} of a tokenised treasury or credit product on ${p.name} on ${chain} after its KYC/whitelist step; RWA launches reward holders of record, and onboarding takes days, so start before any announcement. Cost: onboarding time 1-3 days, gas after.`,
      `Hold the position through at least one full yield distribution so the wallet appears on a payout register. Cost: $0, passive for 30-90 days.`,
      `Keep the KYC wallet clean and separate: RWA allocations are compliance-checked, and a flagged farming wallet can lose the whole position's eligibility. Cost: $0.`,
    ],
    'Risk Curators': [
      `Deposit ${tier} into a ${p.name}-curated vault on ${chain} (through its host lending market) and hold for 60-90 days; curators launching tokens reward the vault depositors they can attribute. Gas: about $1-$5.`,
      `Spread a second deposit across a different ${p.name} vault on ${chain2} so you appear under two of its strategies. Cost: gas only, 10 minutes.`,
      `Track the curator's risk reports monthly; when a curator launches, early depositors who stayed through a full risk cycle are the cohort it names first. Cost: $0, 10 minutes a month.`,
    ],
    'Onchain Capital Allocator': [
      `Allocate ${tier} through ${p.name} on ${chain} and leave the allocation untouched for a full quarter; allocator snapshots read average managed balance. Gas: about $1-$5.`,
      `Rebalance once mid-quarter using ${p.name}'s own tools so the wallet records an active decision, not just a deposit. Cost: gas only, 10 minutes.`,
      `Withdraw nothing before any announced snapshot; allocator formulas routinely zero out wallets that exited early. Cost: $0, patience.`,
    ],
    'Basis Trading': [
      `Open ${tier} in the flagship ${p.name} basis vault on ${chain} and hold through at least two funding cycles (about 2-4 weeks); basis products snapshot time-weighted deposits. Gas: about $1-$4.`,
      `Add a second, smaller tranche a month later to show two separate entry dates. Cost: gas only, 10 minutes.`,
      `Hold any points or receipt tokens ${p.name} issues in the same wallet; splitting them across wallets breaks attribution. Cost: $0.`,
    ],
    'Staking Pool': [
      `Stake ${tier} through ${p.name} on ${chain} and keep it staked for 90+ days; pool launches reward stake duration almost linearly. Gas: about $1-$3.`,
      `Claim and restake rewards monthly so the position compounds and the wallet shows a heartbeat. Cost: small gas, 5 minutes a month.`,
      `Run the stake from the same wallet you use for the chain's other apps; pooled-stake snapshots cross-check ecosystem activity. Cost: $0.`,
    ],
  };
  const middle = playbooks[cat] ?? [
    `Use ${p.name}'s core product on ${chain} with ${tier} at least twice a month for two months; for a ${cat.toLowerCase()} protocol, repeated real usage is what a launch snapshot can measure. Cost: normal product fees plus gas, about 20 minutes a month.`,
    `Hold a continuous position or balance with ${p.name} for 60-90 days instead of dipping in once; duration is the cheapest signal to earn and the most common one launches pay for. Cost: capital in place, $0 extra.`,
    `Try one secondary feature of ${p.name} (a second market, chain or tool) so the wallet is in the engaged minority if the formula tiers users by breadth. Cost: gas only, 15 minutes.`,
  ];
  return [open, momentum, ...middle.filter((s) => s.length > 0), review];
}

/**
 * The farm plan at a glance: the budget, the holding period and the weekly effort, sized by the
 * protocol's TVL tier and category, so a reader can price the whole plan before reading its steps.
 */
export function farmSummary(p: SnapshotProtocol): string {
  const cat = p.category ?? '';
  const gas = /Bridge|CDP|Lending/.test(cat) ? '$10-$40 of gas and fees' : /CEX/.test(cat) ? 'trading fees only, no gas' : /Staking|Restaking|Yield/.test(cat) ? '$5-$25 of gas' : '$5-$30 of gas and fees';
  const hold = /CEX/.test(cat) ? 'an ongoing customer history, reviewed monthly' : /Yield|Allocator|Curator/.test(cat) ? 'a 60-90 day hold, checked monthly' : 'a 60-90 day position, checked weekly';
  const size = p.tvl_usd >= 1_000_000_000 ? 'sized $1,000-$5,000' : p.tvl_usd >= 100_000_000 ? 'sized $250-$1,000' : 'sized $50-$250';
  return `Plan at a glance: ${size}, ${gas}, ${hold}.`;
}

/** The ordinal of a rank: 1st, 2nd, 3rd, 4th, 11th, 21st. */
function ordinal(n: number): string {
  const mod100 = n % 100;
  const mod10 = n % 10;
  const suffix = mod100 >= 11 && mod100 <= 13 ? 'th' : mod10 === 1 ? 'st' : mod10 === 2 ? 'nd' : mod10 === 3 ? 'rd' : 'th';
  return `${n}${suffix}`;
}

/**
 * Peer context for one protocol, in a single sentence: how big its category is, how much of it
 * has already issued a token, the median multiple its tokenized peers trade at, and where this
 * protocol stands by TVL inside the category. Every number comes from the snapshot alone; when
 * no tokenized peer prices the category, the sentence says the multiple is borrowed from the
 * snapshot-wide median instead of pretending the category priced it.
 */
export function peerNote(p: SnapshotProtocol, ev: CategoryEvidence, tvlRank: number): string {
  const cat = p.category ?? 'Uncategorised';
  const share = `${ev.tokenized} of ${ev.members} already trade`;
  // The drawer shows the multiple the model actually applies (peerMultiple: shrunk
  // toward the snapshot median by sample size, capped at the 90th percentile), so the
  // note quotes it too: a raw median alone would contradict the drawer's own math.
  // When shrinkage moved the number, the note says so in one clause instead of hiding it.
  const shrunk =
    ev.peers > 0 && Math.abs(ev.peerMultiple - ev.medianMultiple) / ev.medianMultiple > 0.05
      ? `, shrunk to ${ev.peerMultiple.toFixed(2)}× on ${ev.peers} peer${ev.peers === 1 ? '' : 's'}`
      : '';
  const multiple =
    ev.peers > 0
      ? `their median token trades at ${ev.medianMultiple.toFixed(2)}× TVL${shrunk}`
      : `no tokenized peer prices the category, so its multiple borrows the snapshot-wide median of ${ev.medianMultiple.toFixed(2)}×`;
  return `${cat} holds ${ev.members} protocols; ${share}, ${multiple}, and ${p.name} is the ${ordinal(tvlRank)}-largest by TVL in the category.`;
}

/** Parse and validate the sealed snapshot text. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('the snapshot is not valid JSON');
  }
  const doc = raw as Partial<Snapshot>;
  if (typeof doc.as_of !== 'string' || !Array.isArray(doc.protocols) || !Array.isArray(doc.watchlist)) {
    throw new SnapshotError('the snapshot lacks as_of, protocols or watchlist');
  }
  return doc as Snapshot;
}

/** Build the ranked board and the dashboard's data from the snapshot. */
export function buildRadar(snapshot: Snapshot): { board: BoardRow[]; radar: RadarData } {
  const evidence = categoryEvidence(snapshot, MODEL);
  const globalMedian = median(
    snapshot.protocols
      .filter((p) => !isPreToken(p) && p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0)
      .map((p) => p.mcap_usd! / p.tvl_usd),
  );
  const watch = new Set(snapshot.watchlist);
  const preToken = snapshot.protocols.filter(isPreToken);
  const scored = preToken
    .filter((p) => !PRODUCT_CATEGORIES.has(p.category ?? ''))
    .map((p) => {
      const ev = evidence.get(p.category ?? 'Uncategorised')!;
      const v = impliedValue(p, snapshot.as_of, ev, MODEL);
      return { p, v };
    })
    .sort((a, b) => b.v.implied - a.v.implied || b.p.tvl_usd - a.p.tvl_usd || a.p.slug.localeCompare(b.p.slug));
  // Enforce strictly decreasing implied values so ranks are unambiguous.
  for (let i = 1; i < scored.length; i += 1) {
    if (scored[i]!.v.implied >= scored[i - 1]!.v.implied) scored[i]!.v.implied = Math.max(1, scored[i - 1]!.v.implied - 1);
  }
  // TVL rank inside each category, counted over every protocol in the category, tokenized or not.
  const tvlRank = new Map<string, number>();
  const byCategory = new Map<string, SnapshotProtocol[]>();
  for (const p of snapshot.protocols) {
    const cat = p.category ?? 'Uncategorised';
    const list = byCategory.get(cat) ?? [];
    list.push(p);
    byCategory.set(cat, list);
  }
  for (const list of byCategory.values()) {
    [...list].sort((a, b) => b.tvl_usd - a.tvl_usd).forEach((p, i) => tvlRank.set(p.slug, i + 1));
  }
  const board: BoardRow[] = scored.map(({ p, v }, i) => ({
    rank: i + 1,
    slug: p.slug,
    name: p.name,
    category: p.category,
    chains: p.chains,
    tvl_usd: p.tvl_usd,
    change_7d: p.change_7d,
    mcap_usd: p.mcap_usd,
    listed_at: p.listed_at,
    gecko_id: p.gecko_id,
    symbol: p.symbol,
    token_status: 'pre-token',
    age_days: v.age,
    implied_value_usd: v.implied,
    model: {
      peer_multiple: Number(v.peerMultiple.toFixed(4)),
      momentum_multiplier: Number(v.momentum.toFixed(4)),
      maturity_multiplier: Number(v.maturity.toFixed(4)),
      issuance_factor: Number(v.issuance.toFixed(4)),
      age_days: v.age,
    },
    farm_steps: farmPlan(p, snapshot.as_of),
    farm_summary: farmSummary(p),
    peer_note: peerNote(p, evidence.get(p.category ?? 'Uncategorised')!, tvlRank.get(p.slug) ?? 1),
  }));
  const live: LiveRow[] = snapshot.protocols
    .filter((p) => !isPreToken(p) && p.mcap_usd !== null)
    .sort((a, b) => b.mcap_usd! - a.mcap_usd!)
    .slice(0, LIVE_ROWS)
    .map((p) => ({ slug: p.slug, name: p.name, category: p.category, chains: p.chains, tvl_usd: p.tvl_usd, mcap_usd: p.mcap_usd, change_7d: p.change_7d }));
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model: MODEL,
    model_version: MODEL_VERSION,
    global_median_multiple: Number(globalMedian.toFixed(4)),
    total_protocols: snapshot.protocols.length,
    products_size: preToken.length - board.length,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: board.length - snapshot.watchlist.length,
    live_size: live.length,
    rows: board.map((r) => ({
      rank: r.rank,
      slug: r.slug,
      name: r.name,
      category: r.category,
      chains: r.chains,
      tvl_usd: r.tvl_usd,
      change_7d: r.change_7d,
      listed_at: r.listed_at,
      age_days: r.age_days,
      implied_value_usd: r.implied_value_usd,
      peer_multiple: r.model.peer_multiple,
      momentum_multiplier: r.model.momentum_multiplier,
      maturity_multiplier: r.model.maturity_multiplier,
      issuance_factor: r.model.issuance_factor,
      watchlist: watch.has(r.slug),
      farm_steps: r.farm_steps,
      farm_summary: r.farm_summary,
      peer_note: r.peer_note,
    })),
    live,
  };
  return { board, radar };
}

/** The gate's shape, checked before anything is written: null when the board is valid. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  if (board.length < 100 || board.length > 4000) return `board holds ${board.length} rows, outside 100-4000`;
  const slugs = new Set(board.map((r) => r.slug));
  if (slugs.size !== board.length) return 'board holds a slug twice';
  const known = new Set(snapshot.protocols.map((p) => p.slug));
  for (const r of board) if (!known.has(r.slug)) return `board names an unknown slug: ${r.slug}`;
  for (const w of snapshot.watchlist) if (!slugs.has(w)) return `board misses watchlist slug: ${w}`;
  for (let i = 0; i < board.length; i += 1) {
    const r = board[i]!;
    if (r.rank !== i + 1) return `row ${r.slug} holds rank ${r.rank}, expected ${i + 1}`;
    if (i > 0 && r.implied_value_usd > board[i - 1]!.implied_value_usd) return `implied value rises at rank ${r.rank}`;
    if (r.farm_steps.length < 3 || r.farm_steps.length > 12) return `row ${r.slug} holds ${r.farm_steps.length} farm steps`;
    for (const s of r.farm_steps) {
      const t = s.trim();
      if (t.length < 20 || t.length > 600) return `row ${r.slug} holds a farm step of ${t.length} characters`;
    }
    if (!r.peer_note || r.peer_note.trim().length === 0 || r.peer_note.length > 400) return `row ${r.slug} holds a peer note of ${r.peer_note?.length ?? 0} characters`;
  }
  return null;
}

/** The dashboard's data as a script: window.RADAR = {...}. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR = ${JSON.stringify(radar)};\n`;
}
