// Vercel Serverless Function: /api/quotes?symbols=AAPL,MSFT,GC=F
// Yahoo Finance requires cookie + crumb auth since 2024
const https = require('https');

function httpsGet(url, options = {}) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: 12000, ...options }, (res) => {
      const cookies = res.headers['set-cookie'] || [];
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, data, cookies, headers: res.headers }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

function parseCookies(cookieArr) {
  return cookieArr.map(c => c.split(';')[0]).join('; ');
}

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
const FIELDS = 'regularMarketPrice,regularMarketChange,regularMarketChangePercent,regularMarketPreviousClose,shortName,symbol,trailingPE,forwardPE,marketCap,trailingEps,fiftyTwoWeekHigh,fiftyTwoWeekLow,averageVolume,dividendYield';

// Try to get crumb without loading the heavy homepage (avoids header overflow)
async function getCrumbLight() {
  // Step 1: hit a lightweight Yahoo endpoint to get the A1 session cookie
  const seedResp = await httpsGet('https://query1.finance.yahoo.com/v1/test/getcrumb', {
    headers: {
      'User-Agent': UA,
      'Accept': '*/*',
      'Accept-Language': 'en-US,en;q=0.9',
    }
  });

  const seedCookie = parseCookies(seedResp.cookies);
  const directCrumb = (seedResp.data || '').trim();

  // If we got a valid crumb on the first try (no auth needed), use it
  if (directCrumb && !directCrumb.includes('<') && directCrumb.length < 50) {
    return { crumb: directCrumb, cookieStr: seedCookie };
  }

  // Step 2: Need a real session — hit the smaller consent/fc endpoint instead of homepage
  const consentResp = await httpsGet('https://fc.yahoo.com/', {
    headers: {
      'User-Agent': UA,
      'Accept': 'text/html,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'identity',
    }
  });

  let cookieStr = parseCookies(consentResp.cookies);

  // Step 3: Get crumb with the fc.yahoo.com cookie
  const crumbResp = await httpsGet('https://query1.finance.yahoo.com/v1/test/getcrumb', {
    headers: {
      'User-Agent': UA,
      'Accept': '*/*',
      'Cookie': cookieStr,
      'Referer': 'https://finance.yahoo.com/',
    }
  });

  if (crumbResp.cookies && crumbResp.cookies.length > 0) {
    cookieStr = parseCookies([...consentResp.cookies, ...crumbResp.cookies]);
  }

  const crumb = (crumbResp.data || '').trim();
  if (!crumb || crumb.includes('<')) {
    throw new Error('Invalid crumb: ' + crumb.substring(0, 80));
  }

  return { crumb, cookieStr };
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'public, max-age=60');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const symbols = req.query && req.query.symbols;
  if (!symbols) {
    res.status(400).json({ error: 'symbols param required' });
    return;
  }

  try {
    const { crumb, cookieStr } = await getCrumbLight();

    const symEnc = encodeURIComponent(symbols);
    const crumbEnc = encodeURIComponent(crumb);
    const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${symEnc}&formatted=false&crumb=${crumbEnc}&lang=en-US&region=US&fields=${FIELDS}`;

    const quotesResp = await httpsGet(url, {
      headers: {
        'User-Agent': UA,
        'Accept': 'application/json',
        'Cookie': cookieStr,
        'Referer': 'https://finance.yahoo.com/',
      }
    });

    if (quotesResp.status === 200) {
      const parsed = JSON.parse(quotesResp.data);
      const results = parsed && parsed.quoteResponse && parsed.quoteResponse.result;
      if (results && results.length > 0) {
        res.status(200).send(quotesResp.data);
        return;
      }
    }

    throw new Error('Quotes returned status ' + quotesResp.status + ': ' + quotesResp.data.substring(0, 120));

  } catch (e) {
    console.error('Yahoo Finance flow failed:', e.message);
    res.status(502).json({ error: 'Yahoo Finance unavailable', detail: e.message });
  }
};
