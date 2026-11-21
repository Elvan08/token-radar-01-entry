// LaunchScope dashboard. Reads window.RADAR (written beside dashboard/ by main.ts) and renders the
// ranked board with search, category / chain / watchlist filters, five sort orders, a per-protocol
// detail drawer that audits the implied value factor by factor, the protocol's farm plan, and a
// live tab of protocols whose token already trades. No network: every byte shown is in data.js.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = { q: '', category: 'all', chain: 'all', watch: false, tab: 'board', sort: 'implied_value_usd', dir: -1, selected: null };

  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return '$' + Math.round(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(1) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + ' yrs';
    if (days >= 30) return Math.round(days / 30) + ' mo';
    return days + ' d';
  }
  function esc(s) {
    return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function bySlug(slug) {
    for (var i = 0; i < DATA.rows.length; i++) if (DATA.rows[i].slug === slug) return DATA.rows[i];
    return null;
  }

  var categories = [];
  var chains = [];
  DATA.rows.forEach(function (r) {
    var c = r.category || 'Uncategorised';
    if (categories.indexOf(c) < 0) categories.push(c);
    r.chains.forEach(function (ch) { if (chains.indexOf(ch) < 0) chains.push(ch); });
  });
  categories.sort();
  chains.sort();

  function filtered() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.watch && !r.watchlist) return false;
      if (state.category !== 'all' && (r.category || 'Uncategorised') !== state.category) return false;
      if (state.chain !== 'all' && r.chains.indexOf(state.chain) < 0) return false;
      if (q && r.name.toLowerCase().indexOf(q) < 0 && r.slug.indexOf(q) < 0) return false;
      return true;
    }).sort(function (a, b) {
      var k = state.sort;
      var av = a[k], bv = b[k];
      if (av === null || av === undefined) av = -Infinity;
      if (bv === null || bv === undefined) bv = -Infinity;
      if (av !== bv) return (av < bv ? -1 : 1) * state.dir;
      return a.rank - b.rank;
    });
  }

  function headerHtml() {
    var total = DATA.total_protocols || (DATA.board_size + DATA.live_size);
    return '' +
      '<header class="masthead">' +
      '<p class="kicker">Token launch radar &middot; model ' + esc(DATA.model_version) + '</p>' +
      '<h1>Launch<span class="scope">Scope</span></h1>' +
      '<p class="lede">Every standalone protocol in the snapshot that still has <strong>no token</strong>, ranked by what its launch would be worth. ' +
      'Wrapped and staked products of assets that already trade are counted and set aside, never ranked &mdash; a wrapped bitcoin does not launch a second bitcoin. ' +
      'The price of each future token is read off the protocols whose tokens already trade &mdash; no names are picked by hand, and every number on this page can be audited down to its four factors. ' +
      'Each protocol&rsquo;s drawer also spells out its peer context: how big its category is, how much of it already trades, and where it stands by TVL among its peers.</p>' +
      '<div class="stats">' +
      '<div class="stat"><span class="n">' + total + '</span><span class="l">protocols scanned</span></div>' +
      '<div class="stat"><span class="n">' + DATA.board_size + '</span><span class="l">pre-token, ranked</span></div>' +
      '<div class="stat"><span class="n">' + DATA.products_size + '</span><span class="l">wrapped products set aside</span></div>' +
      '<div class="stat"><span class="n">' + DATA.watchlist_size + ' / ' + DATA.watchlist_size + '</span><span class="l">watchlist covered</span></div>' +
      '<div class="stat"><span class="n">' + DATA.global_median_multiple.toFixed(3) + '&times;</span><span class="l">median mcap / TVL</span></div>' +
      '<div class="stat"><span class="n">' + esc(DATA.as_of) + '</span><span class="l">snapshot date</span></div>' +
      '</div></header>' +
      '<section class="model">' +
      '<div class="factor"><h3>1 &middot; Peer multiple</h3><p>The median <b>mcap/TVL</b> of tokenized protocols in the same category, shrunk toward the snapshot median by sample size and capped at the snapshot&rsquo;s 90th percentile, so one thin category cannot own the board.</p></div>' +
      '<div class="factor"><h3>2 &middot; Momentum</h3><p>Seven-day TVL growth on an exponential curve, <b>exp(change &times; 0.9)</b>: growth compounds, one bad week cannot zero a protocol.</p></div>' +
      '<div class="factor"><h3>3 &middot; Maturity</h3><p>Years tracked with no token, on a saturating curve up to <b>+15%</b>: a proven product is worth more than a newborn.</p></div>' +
      '<div class="factor"><h3>4 &middot; Issuance prior</h3><p>The share of the category that ever issued a token, counted from this snapshot: some categories launch, some never do.</p></div>' +
      '</section>' +
      '<p class="formula"><b>implied value</b> = TVL &times; peer multiple &times; momentum &times; maturity &times; issuance factor</p>';
  }

  function controlsHtml() {
    var catOpts = '<option value="all">All categories</option>' + categories.map(function (c) {
      return '<option value="' + esc(c) + '"' + (state.category === c ? ' selected' : '') + '>' + esc(c) + '</option>';
    }).join('');
    var chainOpts = '<option value="all">All chains</option>' + chains.map(function (c) {
      return '<option value="' + esc(c) + '"' + (state.chain === c ? ' selected' : '') + '>' + esc(c) + '</option>';
    }).join('');
    var sorts = [
      ['implied_value_usd', 'Implied value'], ['tvl_usd', 'TVL'], ['change_7d', '7d growth'],
      ['age_days', 'Age without token'], ['peer_multiple', 'Peer multiple'],
    ];
    var sortOpts = sorts.map(function (s) {
      return '<option value="' + s[0] + '"' + (state.sort === s[0] ? ' selected' : '') + '>' + s[1] + '</option>';
    }).join('');
    return '<section class="controls">' +
      '<div class="field"><label for="q">Search</label><input id="q" type="search" placeholder="Protocol name&hellip;" value="' + esc(state.q) + '"></div>' +
      '<div class="field"><label for="cat">Category</label><select id="cat">' + catOpts + '</select></div>' +
      '<div class="field"><label for="chain">Chain</label><select id="chain">' + chainOpts + '</select></div>' +
      '<div class="field"><label for="sort">Sort by</label><select id="sort">' + sortOpts + '</select></div>' +
      '<div class="field check"><input id="watch" type="checkbox"' + (state.watch ? ' checked' : '') + '><label for="watch">Watchlist only (TVL &ge; ' + fmtUsd(DATA.floor_usd) + ')</label></div>' +
      '<div class="count" id="count"></div>' +
      '</section>' +
      '<nav class="tabs">' +
      '<button data-tab="board" class="' + (state.tab === 'board' ? 'on' : '') + '">Pre-token board</button>' +
      '<button data-tab="live" class="' + (state.tab === 'live' ? 'on' : '') + '">Already trading &mdash; the reference set</button>' +
      '</nav>';
  }

  function moversHtml() {
    var movers = DATA.rows.filter(function (r) { return r.watchlist && r.change_7d !== null; })
      .sort(function (a, b) { return b.change_7d - a.change_7d; }).slice(0, 5);
    if (!movers.length) return '';
    var chips = movers.map(function (r) {
      return '<button class="chip" data-slug="' + esc(r.slug) + '">' + esc(r.name) + ' <b class="' + (r.change_7d >= 0 ? 'pos' : 'neg') + '">' + fmtPct(r.change_7d) + '</b></button>';
    }).join('');
    return '<section class="movers"><span class="movers-label">Watchlist movers &mdash; fastest 7d TVL growth</span><span class="chips">' + chips + '</span></section>';
  }

  function boardHtml(rows) {
    var max = rows.length ? Math.max.apply(null, rows.map(function (r) { return r.implied_value_usd; })) : 1;
    var head = '<table><thead><tr>' +
      '<th data-k="rank">#</th><th data-k="name">Protocol</th><th class="hide-m">Category</th>' +
      '<th class="num" data-k="tvl_usd">TVL</th><th class="num hide-m" data-k="change_7d">7d</th>' +
      '<th class="num hide-m" data-k="age_days">Age</th><th class="num hide-m" data-k="peer_multiple">Peer &times;</th>' +
      '<th class="num" data-k="implied_value_usd">Implied value</th></tr></thead><tbody>';
    if (!rows.length) return head + '<tr><td colspan="8" class="empty">No protocol matches these filters. Loosen one and the radar sweeps again.</td></tr></tbody></table>';
    var body = rows.map(function (r) {
      var pct = Math.max(2, Math.round((r.implied_value_usd / max) * 100));
      return '<tr data-slug="' + esc(r.slug) + '"' + (r.rank <= 3 ? ' class="top"' : '') + '>' +
        '<td class="rank">' + r.rank + '</td>' +
        '<td class="name"><span class="pname">' + esc(r.name) + '</span>' + (r.watchlist ? '<span class="badge">Watchlist</span>' : '') +
        '<span class="chains">' + esc(r.chains.slice(0, 3).join(' · ')) + (r.chains.length > 3 ? ' +' + (r.chains.length - 3) : '') + '</span></td>' +
        '<td class="cat hide-m">' + esc(r.category || 'Uncategorised') + '</td>' +
        '<td class="num">' + fmtUsd(r.tvl_usd) + '</td>' +
        '<td class="num hide-m ' + (r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg') + '">' + fmtPct(r.change_7d) + '</td>' +
        '<td class="num hide-m">' + fmtAge(r.age_days) + '</td>' +
        '<td class="num hide-m">' + r.peer_multiple.toFixed(2) + '&times;</td>' +
        '<td class="num"><b>' + fmtUsd(r.implied_value_usd) + '</b><span class="bar"><i style="width:' + pct + '%"></i></span></td></tr>';
    }).join('');
    return head + body + '</tbody></table>';
  }

  function liveHtml() {
    var head = '<table><thead><tr><th>Protocol</th><th class="hide-m">Category</th>' +
      '<th class="num">Market cap (actual)</th><th class="num">TVL</th><th class="num hide-m">mcap / TVL</th><th class="num hide-m">7d</th></tr></thead><tbody>';
    var body = DATA.live.map(function (r) {
      var ratio = r.mcap_usd && r.tvl_usd ? (r.mcap_usd / r.tvl_usd).toFixed(2) + '&times;' : 'n/a';
      return '<tr><td class="name"><span class="pname">' + esc(r.name) + '</span><span class="badge live">Trading</span>' +
        '<span class="chains">' + esc(r.chains.slice(0, 3).join(' · ')) + '</span></td>' +
        '<td class="cat hide-m">' + esc(r.category || 'Uncategorised') + '</td>' +
        '<td class="num"><b>' + fmtUsd(r.mcap_usd) + '</b></td><td class="num">' + fmtUsd(r.tvl_usd) + '</td>' +
        '<td class="num hide-m">' + ratio + '</td>' +
        '<td class="num hide-m ' + (r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg') + '">' + fmtPct(r.change_7d) + '</td></tr>';
    }).join('');
    return '<p class="lede" style="color:var(--muted);margin:0 0 10px">These protocols already issued their token, so the market &mdash; not the model &mdash; sets their value. Their category medians are the evidence the pre-token board is priced from.</p>' + head + body + '</tbody></table>';
  }

  function drawerHtml(r) {
    if (!r) return '';
    var steps = r.farm_steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('');
    var raw = r.tvl_usd * r.peer_multiple;
    return '<div class="scrim open" id="scrim"></div><aside class="drawer open" id="drawer">' +
      '<button class="close" id="close">&times; Close</button>' +
      '<p class="kicker">Rank #' + r.rank + ' of ' + DATA.board_size + (r.watchlist ? ' &middot; Watchlist' : ' &middot; Early radar') + '</p>' +
      '<h2>' + esc(r.name) + '</h2>' +
      '<p class="meta">' + esc(r.category || 'Uncategorised') + ' &middot; ' + esc(r.chains.join(', ')) + ' &middot; tracked since ' + esc(r.listed_at || 'unknown') + '</p>' +
      '<div class="big-label">Implied launch value</div><div class="big-implied">' + fmtUsd(r.implied_value_usd) + '</div>' +
      '<div class="factors">' +
      '<div class="row"><span>TVL (snapshot)</span><span>' + fmtUsd(r.tvl_usd) + '</span></div>' +
      '<div class="row"><span>Peer multiple &mdash; category median mcap/TVL</span><span>&times; ' + r.peer_multiple.toFixed(3) + '</span></div>' +
      '<div class="row"><span>TVL at peer value</span><span>' + fmtUsd(Math.round(raw)) + '</span></div>' +
      '<div class="row"><span>Momentum &mdash; 7d TVL change ' + fmtPct(r.change_7d) + '</span><span>&times; ' + r.momentum_multiplier.toFixed(3) + '</span></div>' +
      '<div class="row"><span>Maturity &mdash; ' + fmtAge(r.age_days) + ' with no token</span><span>&times; ' + r.maturity_multiplier.toFixed(3) + '</span></div>' +
      '<div class="row"><span>Issuance factor &mdash; category launch history</span><span>&times; ' + r.issuance_factor.toFixed(3) + '</span></div>' +
      '<div class="row"><span>Implied value</span><span>' + fmtUsd(r.implied_value_usd) + '</span></div>' +
      '</div>' +
      '<div class="why"><b>Why this rank:</b> ' + esc(r.name) + ' holds ' + fmtUsd(r.tvl_usd) + ' of TVL. Protocols like it that already trade are worth about ' +
      r.peer_multiple.toFixed(2) + '&times; their TVL; its ' + fmtPct(r.change_7d) + ' week and ' + fmtAge(r.age_days) + ' without a token move the estimate to ' + fmtUsd(r.implied_value_usd) +
      '. The number is the model&rsquo;s claim from the snapshot alone &mdash; it prices the launch, it does not promise one.</div>' +
      '<h3 class="plan">Peer context</h3>' +
      '<p class="why">' + esc(r.peer_note || 'Peer context was not computed for this row.') + '</p>' +
      '<h3 class="plan">Farm plan &mdash; before the launch</h3>' +
      '<p style="color:var(--muted);margin:0 0 10px;font-size:14px"><b style="color:var(--amber)">' + esc(r.farm_summary || '') + '</b></p><ol class="steps">' + steps + '</ol>' +
      '</aside>';
  }

  function render() {
    var rows = state.tab === 'board' ? filtered() : [];
    app.innerHTML = headerHtml() + controlsHtml() +
      (state.tab === 'board' ? moversHtml() + boardHtml(rows) : liveHtml()) +
      '<footer>Source: <b>' + esc(DATA.source) + '</b> &middot; sealed snapshot as of <b>' + esc(DATA.as_of) + '</b>. ' +
      'Implied values are this entry&rsquo;s model (' + esc(DATA.model_version) + '), computed only from the snapshot&rsquo;s figures; they are claims to argue with, not prices. ' +
      'Farm plans are starting points &mdash; check a protocol&rsquo;s own docs before moving money.</footer>' +
      drawerHtml(state.selected ? bySlug(state.selected) : null);
    app.setAttribute('aria-busy', 'false');
    var count = document.getElementById('count');
    if (count && state.tab === 'board') count.innerHTML = 'showing <b>' + rows.length + '</b> of ' + DATA.board_size + ' protocols';
    if (count && state.tab === 'live') count.innerHTML = '<b>' + DATA.live.length + '</b> largest trading protocols';
    bind(rows);
  }

  function bind(rows) {
    var q = document.getElementById('q');
    q.addEventListener('input', function () { state.q = q.value; rerenderTable(); });
    document.getElementById('cat').addEventListener('change', function (e) { state.category = e.target.value; rerenderTable(); });
    document.getElementById('chain').addEventListener('change', function (e) { state.chain = e.target.value; rerenderTable(); });
    document.getElementById('sort').addEventListener('change', function (e) { state.sort = e.target.value; state.dir = -1; rerenderTable(); });
    document.getElementById('watch').addEventListener('change', function (e) { state.watch = e.target.checked; rerenderTable(); });
    Array.prototype.forEach.call(document.querySelectorAll('.tabs button'), function (b) {
      b.addEventListener('click', function () { state.tab = b.getAttribute('data-tab'); render(); });
    });
    Array.prototype.forEach.call(document.querySelectorAll('.movers .chip'), function (chip) {
      chip.addEventListener('click', function () { openDrawer(chip.getAttribute('data-slug')); });
    });
    Array.prototype.forEach.call(document.querySelectorAll('thead th[data-k]'), function (th) {
      th.addEventListener('click', function () {
        var k = th.getAttribute('data-k');
        var map = { rank: 'rank', name: 'name', tvl_usd: 'tvl_usd', change_7d: 'change_7d', age_days: 'age_days', peer_multiple: 'peer_multiple', implied_value_usd: 'implied_value_usd' };
        if (!map[k]) return;
        if (state.sort === map[k]) state.dir = -state.dir; else { state.sort = map[k]; state.dir = map[k] === 'name' ? 1 : -1; }
        rerenderTable();
      });
    });
    Array.prototype.forEach.call(document.querySelectorAll('tbody tr[data-slug]'), function (tr) {
      tr.addEventListener('click', function () { openDrawer(tr.getAttribute('data-slug')); });
    });
    var close = document.getElementById('close');
    if (close) close.addEventListener('click', closeDrawer);
    var scrim = document.getElementById('scrim');
    if (scrim) scrim.addEventListener('click', closeDrawer);
  }

  function rerenderTable() {
    render();
    var q = document.getElementById('q');
    if (q && state.q) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); }
  }
  function openDrawer(slug) {
    state.selected = slug;
    render();
    if (window.history && history.replaceState) history.replaceState(null, '', '#/protocol/' + slug);
  }
  function closeDrawer() {
    state.selected = null;
    render();
    if (window.history && history.replaceState) history.replaceState(null, '', location.pathname + location.search);
  }
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && state.selected) closeDrawer(); });

  // Deep links the screenshots (and readers) use: #/protocol/<slug>, #/category/<name>, #/watchlist
  var hash = location.hash || '';
  var pm = hash.match(/^#\/protocol\/(.+)$/);
  var cm = hash.match(/^#\/category\/(.+)$/);
  if (pm && bySlug(decodeURIComponent(pm[1]))) state.selected = decodeURIComponent(pm[1]);
  if (cm) { state.category = decodeURIComponent(cm[1]); }
  if (hash === '#/watchlist') state.watch = true;
  render();
})();
