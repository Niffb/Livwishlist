const SUPABASE_URL = 'https://tzhmcojnjnjtdrhkpdph.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR6aG1jb2puam5qdGRyaGtwZHBoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE1MTIzMTYsImV4cCI6MjA4NzA4ODMxNn0.VhcR5YpvUglBbwqvw9FtM9l-s3H1IVFJZFAFMyZPshU';

function getHeaders() {
  return {
    'apikey': SUPABASE_ANON_KEY,
    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json'
  };
}

async function getRealProductImage(item) {
  const urlStr = item.url;
  if (!urlStr) return '';

  // 1. Shopify API check (works for 50%+ of fashion / ecommerce stores)
  try {
    const cleanUrl = urlStr.split('?')[0].replace(/\/$/, '');
    if (cleanUrl.includes('/products/')) {
      const jsonUrl = cleanUrl + '.json';
      const res = await fetch(jsonUrl, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } });
      if (res.ok) {
        const data = await res.json();
        if (data.product && data.product.images && data.product.images.length > 0) {
          const img = data.product.images[0].src;
          if (img) {
            return img.startsWith('//') ? 'https:' + img : img;
          }
        }
      }
    }
  } catch (e) {}

  // 2. Amazon check (ASIN / ISBN)
  try {
    let finalUrl = urlStr;
    if (urlStr.includes('amzn.eu') || urlStr.includes('a.co')) {
      const exp = await fetch(urlStr, { redirect: 'follow', headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } });
      finalUrl = exp.url || urlStr;
    }
    const asinMatch = finalUrl.match(/(?:dp|gp\/product|product|asin)\/([A-Z0-9]{10})/i);
    if (asinMatch && asinMatch[1]) {
      const asin = asinMatch[1];
      // Try Amazon CDN image formats
      return `https://images-na.ssl-images-amazon.com/images/P/${asin}.01.LZZZZZZZ.jpg`;
    }
  } catch (e) {}

  // 3. OpenGraph / Twitter HTML Parsing
  try {
    const res = await fetch(urlStr, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8'
      }
    });
    if (res.ok) {
      const html = await res.text();
      const ogMatch = html.match(/meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i) ||
                      html.match(/meta\s+name=["']og:image["']\s+content=["']([^"']+)["']/i) ||
                      html.match(/meta\s+name=["']twitter:image["']\s+content=["']([^"']+)["']/i) ||
                      html.match(/meta\s+property=["']twitter:image["']\s+content=["']([^"']+)["']/i);
      if (ogMatch && ogMatch[1]) {
        let img = ogMatch[1].replace(/&amp;/g, '&');
        if (img.startsWith('//')) img = 'https:' + img;
        if (img.startsWith('/')) {
          const u = new URL(urlStr);
          img = `${u.origin}${img}`;
        }
        if (!img.includes('anomaly') && !img.includes('favicon') && !img.includes('logo')) {
          return img;
        }
      }
    }
  } catch (e) {}

  // 4. Bing Image Search Fallback
  try {
    const searchTerms = item.name || urlStr;
    const bingUrl = `https://www.bing.com/images/search?q=${encodeURIComponent(searchTerms + ' product photo')}`;
    const bRes = await fetch(bingUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' }
    });
    if (bRes.ok) {
      const html = await bRes.text();
      const m = html.match(/murl&quot;:&quot;(https?:&#2f;&#2f;[^&]+)&quot;/i);
      if (m && m[1]) {
        const cleanUrl = m[1].replace(/&#2f;/g, '/');
        if (!cleanUrl.includes('bing.com')) {
          return cleanUrl;
        }
      }
    }
  } catch (e) {}

  return '';
}

async function run() {
  console.log('Fetching database items...');
  const res = await fetch(`${SUPABASE_URL}/rest/v1/wishlist?select=*`, { headers: getHeaders() });
  const items = await res.json();
  console.log(`Processing ${items.length} items to extract real product images...`);

  let count = 0;
  for (const item of items) {
    console.log(`\nFetching image for: "${item.name}"`);
    const imgUrl = await getRealProductImage(item);
    if (imgUrl) {
      console.log(`  ✓ Image found: ${imgUrl}`);
      await fetch(`${SUPABASE_URL}/rest/v1/wishlist?id=eq.${item.id}`, {
        method: 'PATCH',
        headers: getHeaders(),
        body: JSON.stringify({ image: imgUrl })
      });
      count++;
    } else {
      console.log(`  ✗ No image found`);
    }
  }

  console.log(`\nFinished updating images! Successfully updated ${count}/${items.length} items.`);
}

run();
