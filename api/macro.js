// Vercel Serverless Function: /api/macro
// BLS + FRED economic data
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

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'public, max-age=300');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const results = {};

  // BLS: CPI, Unemployment, Payrolls
  const blsSeries = ['CUUR0000SA0', 'LNS14000000', 'CES0000000001'];
  await Promise.allSettled(blsSeries.map(sid =>
    httpsGet(`https://api.bls.gov/publicAPI/v1/timeseries/data/${sid}`)
      .then(d => {
        if (!results.bls) results.bls = { Results: { series: [] } };
        results.bls.Results.series.push({ seriesID: sid, data: d?.Results?.series?.[0]?.data || [] });
      })
      .catch(e => console.log('BLS', sid, 'failed:', e.message))
  ));

  // FRED: Fed Funds, GDP, Core PCE, T-Bills, 10Y, 30Y
  const fredSeries = ['FEDFUNDS', 'A191RL1Q225SBEA', 'PCEPILFE', 'DTB3', 'DGS10', 'DGS30'];
  await Promise.allSettled(fredSeries.map(id =>
    httpsGet(`https://fred.stlouisfed.org/graph/fredgraph.json?id=${id}`)
      .then(d => { results[id] = d; })
      .catch(e => console.log('FRED', id, 'failed:', e.message))
  ));

  res.status(200).json(results);
};
