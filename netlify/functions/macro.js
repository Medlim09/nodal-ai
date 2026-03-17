// Netlify Function: /api/macro
// BLS (POST for multi-series) + FRED (direct, supports CORS)
const https = require('https');

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: 10000 }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try { resolve(JSON.parse(data)); } catch (e) { reject(new Error('JSON: ' + e.message)); }
        } else { reject(new Error('HTTP ' + res.statusCode)); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

exports.handler = async () => {
  const results = {};
  const corsHeaders = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'public, max-age=300',
  };

  // ── BLS: one series at a time (v1 public API) ──
  const blsSeries = ['CUUR0000SA0', 'LNS14000000', 'CES0000000001'];
  await Promise.allSettled(blsSeries.map(sid =>
    httpsGet(`https://api.bls.gov/publicAPI/v1/timeseries/data/${sid}`)
      .then(d => { if (!results.bls) results.bls = { Results: { series: [] } }; results.bls.Results.series.push({ seriesID: sid, data: d?.Results?.series?.[0]?.data || [] }); })
      .catch(e => console.log('BLS', sid, 'failed:', e.message))
  ));

  // ── FRED: all in parallel ──
  const fredSeries = ['FEDFUNDS', 'A191RL1Q225SBEA', 'PCEPILFE', 'DTB3', 'DGS10', 'DGS30'];
  await Promise.allSettled(fredSeries.map(id =>
    httpsGet(`https://fred.stlouisfed.org/graph/fredgraph.json?id=${id}`)
      .then(d => { results[id] = d; })
      .catch(e => console.log('FRED', id, 'failed:', e.message))
  ));

  return { statusCode: 200, headers: corsHeaders, body: JSON.stringify(results) };
};
