// Netlify Function: /api/quotes?symbols=AAPL,MSFT,GC=F
// Yahoo Finance now requires cookie + crumb (401 without it)
// Step 1: hit yahoo.com for cookies, Step 2: get crumb, Step 3: fetch quotes
const https = require('https');

function httpsGet(url, options = {}) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: 10000, ...options }, (res) => {
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

exports.handler = async (event) => {
  const corsHeaders = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'public, max-age=60',
  };

  const symbols = event.queryStringParameters && event.queryStringParameters.symbols;
  if (!symbols) {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'symbols param required' }) };
  }

  const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

  try {
    // ── Step 1: Hit Yahoo Finance to get session cookies ──
    const homeResp = await httpsGet('https://finance.yahoo.com/', {
      headers: {
        'User-Agent': UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'identity',
      }
    });

    let cookieStr = parseCookies(homeResp.cookies);

    // ── Step 2: Get crumb using session cookies ──
    const crumbResp = await httpsGet('https://query1.finance.yahoo.com/v1/test/getcrumb', {
      headers: {
        'User-Agent': UA,
        'Accept': '*/*',
        'Cookie': cookieStr,
        'Referer': 'https://finance.yahoo.com/',
      }
    });

    // If crumb request returns new cookies, merge them
    if (crumbResp.cookies && crumbResp.cookies.length > 0) {
      cookieStr = parseCookies([...homeResp.cookies, ...crumbResp.cookies]);
    }

    const crumb = (crumbResp.data || '').trim();
    if (!crumb || crumb.includes('<')) {
      throw new Error('Invalid crumb: ' + crumb.substring(0, 50));
    }

    console.log('Got crumb:', crumb.substring(0, 10) + '...');

    // ── Step 3: Fetch quotes with crumb + cookies ──
    const fields = 'regularMarketPrice,regularMarketChange,regularMarketChangePercent,regularMarketPreviousClose,shortName,symbol';
    const symEnc = encodeURIComponent(symbols);
    const crumbEnc = encodeURIComponent(crumb);
    const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${symEnc}&formatted=false&crumb=${crumbEnc}&lang=en-US&region=US&fields=${fields}`;

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
        return { statusCode: 200, headers: corsHeaders, body: quotesResp.data };
      }
    }

    throw new Error('Quotes returned status ' + quotesResp.status + ': ' + quotesResp.data.substring(0, 100));

  } catch (e) {
    console.error('Yahoo Finance crumb flow failed:', e.message);
    return {
      statusCode: 502,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Yahoo Finance unavailable', detail: e.message }),
    };
  }
};
