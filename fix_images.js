const SUPABASE_URL = 'https://tzhmcojnjnjtdrhkpdph.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR6aG1jb2puam5qdGRyaGtwZHBoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE1MTIzMTYsImV4cCI6MjA4NzA4ODMxNn0.VhcR5YpvUglBbwqvw9FtM9l-s3H1IVFJZFAFMyZPshU';

function getHeaders() {
  return {
    'apikey': SUPABASE_ANON_KEY,
    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json'
  };
}

// Expand short URLs (e.g. amzn.eu) to get real URL
async function expandUrl(shortUrl) {
  try {
    const res = await fetch(shortUrl, { method: 'GET', redirect: 'follow', headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } });
    return res.url || shortUrl;
  } catch (e) {
    return shortUrl;
  }
}

async function getGoodImage(item) {
  const targetUrl = item.url;
  if (!targetUrl) return '';

  const expandedUrl = await expandUrl(targetUrl);
  const urlObj = new URL(expandedUrl);
  const hostname = urlObj.hostname.toLowerCase();

  // 1. Amazon ASIN parsing
  if (hostname.includes('amazon.')) {
    const asinMatch = expandedUrl.match(/(?:dp|gp\/product|exec\/obidos\/asin)\/(B[0-9A-Z]{9})/i);
    if (asinMatch && asinMatch[1]) {
      return `https://images-na.ssl-images-amazon.com/images/I/${asinMatch[1]}.jpg`;
    }
  }

  // 2. Try Microlink API
  try {
    const mlRes = await fetch(`https://api.microlink.io?url=${encodeURIComponent(expandedUrl)}&meta=true`);
    if (mlRes.ok) {
      const mlData = await mlRes.json();
      if (mlData.status === 'success' && mlData.data) {
        const img = mlData.data.image?.url || (Array.isArray(mlData.data.images) ? mlData.data.images[0]?.url : '');
        if (img && /^https?:\/\//i.test(img) && !img.includes('anomaly') && !img.includes('challenge') && !img.includes('captcha') && !img.includes('favicon')) {
          return img;
        }
      }
    }
  } catch (e) {}

  // 3. Try Bing Image Search API / RSS fallback
  try {
    const searchName = (item.name || urlObj.pathname.split('/').pop().replace(/[-_]/g, ' ')).replace(/[^\w\s]/g, '');
    const bingUrl = `https://www.bing.com/images/search?q=${encodeURIComponent(searchName)}&FORM=HDRSC2`;
    const bRes = await fetch(bingUrl, { headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' } });
    if (bRes.ok) {
      const html = await bRes.text();
      const m = html.match(/murl&quot;:&quot;(https?:&#2f;&#2f;[^&]+)&quot;/i) || html.match(/src="(https:\/\/[^"]+\.jpg)"/i);
      if (m && m[1]) {
        const cleanUrl = m[1].replace(/&#2f;/g, '/');
        if (!cleanUrl.includes('bing.com') && !cleanUrl.includes('anomaly')) {
          return cleanUrl;
        }
      }
    }
  } catch (e) {}

  // 4. Clean domain favicon fallback
  return `https://www.google.com/s2/favicons?sz=256&domain=${hostname}`;
}

async function fixAllImages() {
  console.log('Fetching database items...');
  const res = await fetch(`${SUPABASE_URL}/rest/v1/wishlist?select=*`, { headers: getHeaders() });
  const items = await res.json();
  console.log(`Checking ${items.length} items for invalid images...`);

  let count = 0;
  for (const item of items) {
    const isBadImage = !item.image || 
                       item.image.includes('anomaly') || 
                       item.image.includes('challenge') || 
                       item.image.startsWith('.') || 
                       item.image.startsWith('/') ||
                       item.image.includes('favicon.ico');

    if (isBadImage) {
      console.log(`\nFixing image for: "${item.name}"`);
      const newImg = await getGoodImage(item);
      if (newImg) {
        console.log(`  -> New Image URL: ${newImg}`);
        const patchRes = await fetch(`${SUPABASE_URL}/rest/v1/wishlist?id=eq.${item.id}`, {
          method: 'PATCH',
          headers: getHeaders(),
          body: JSON.stringify({ image: newImg })
        });
        if (patchRes.ok) {
          count++;
          console.log(`  ✓ Item updated successfully`);
        }
      }
    }
  }

  console.log(`\nDone! Successfully updated ${count} item images.`);
}

fixAllImages();
