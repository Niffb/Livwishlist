const SUPABASE_URL = 'https://tzhmcojnjnjtdrhkpdph.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR6aG1jb2puam5qdGRyaGtwZHBoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE1MTIzMTYsImV4cCI6MjA4NzA4ODMxNn0.VhcR5YpvUglBbwqvw9FtM9l-s3H1IVFJZFAFMyZPshU';

function getHeaders() {
  return {
    'apikey': SUPABASE_ANON_KEY,
    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json'
  };
}

async function scrapeMetadata(targetUrl) {
  try {
    const urlObj = new URL(targetUrl);
    const hostname = urlObj.hostname.toLowerCase();

    let image = '';
    let price = '';
    let title = '';

    // Microlink API fetch
    try {
      const res = await fetch(`https://api.microlink.io?url=${encodeURIComponent(targetUrl)}&meta=true`);
      if (res.ok) {
        const json = await res.json();
        if (json.status === 'success' && json.data) {
          title = json.data.title || '';
          image = json.data.image?.url || (Array.isArray(json.data.images) ? json.data.images[0]?.url : '');
          if (json.data.price) {
            price = typeof json.data.price === 'number' ? `£${json.data.price}` : json.data.price;
          }
        }
      }
    } catch (e) {}

    // Amazon extraction
    if (hostname.includes('amazon.')) {
      const asinMatch = targetUrl.match(/(?:dp|gp\/product|exec\/obidos\/asin)\/(B[0-9A-Z]{9})/i);
      if (asinMatch && asinMatch[1]) {
        const asin = asinMatch[1];
        if (!image || image.includes('favicon') || image.includes('logo')) {
          image = `https://images-na.ssl-images-amazon.com/images/I/${asin}.jpg`;
        }
      }
    }

    // DuckDuckGo fallback image search
    if (!image || image.includes('favicon.ico') || image.includes('logo')) {
      try {
        const queryName = title || urlObj.pathname.split('/').pop().replace(/[-_]/g, ' ');
        const ddgRes = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(queryName + ' product')}`, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' }
        });
        if (ddgRes.ok) {
          const html = await ddgRes.text();
          const imgMatch = html.match(/class="small"[^>]*src="([^"]+)"/i) || html.match(/<img[^>]+src="([^"]+)"/i);
          if (imgMatch && imgMatch[1]) {
            let imgUrl = imgMatch[1];
            if (imgUrl.startsWith('//')) imgUrl = 'https:' + imgUrl;
            if (!image) image = imgUrl;
          }
        }
      } catch (e) {}
    }

    if (!image) {
      image = `https://www.google.com/s2/favicons?sz=256&domain=${hostname}`;
    }

    return { title, image, price };
  } catch (e) {
    return { title: '', image: '', price: '' };
  }
}

async function refetchAllItems() {
  console.log('Fetching items from Supabase database...');
  const response = await fetch(`${SUPABASE_URL}/rest/v1/wishlist?select=*`, {
    headers: getHeaders()
  });

  if (!response.ok) {
    console.error('Failed to load items from Supabase');
    return;
  }

  const items = await response.json();
  console.log(`Found ${items.length} items to inspect and re-fetch.`);

  let updatedCount = 0;
  for (const item of items) {
    console.log(`\nProcessing: "${item.name}" (${item.url})`);
    const scraped = await scrapeMetadata(item.url);

    const updates = {};
    if (scraped.image && (item.image !== scraped.image || !item.image)) {
      updates.image = scraped.image;
    }
    if (scraped.price && !item.price) {
      updates.price = scraped.price;
    }

    if (Object.keys(updates).length > 0) {
      console.log(`  -> Updating attributes:`, updates);
      const patchRes = await fetch(`${SUPABASE_URL}/rest/v1/wishlist?id=eq.${item.id}`, {
        method: 'PATCH',
        headers: getHeaders(),
        body: JSON.stringify(updates)
      });
      if (patchRes.ok) {
        updatedCount++;
        console.log(`  ✓ Updated item ${item.id}`);
      } else {
        console.error(`  ✗ Failed to update item ${item.id}`);
      }
    } else {
      console.log(`  - No updates needed.`);
    }
  }

  console.log(`\nRe-fetch complete! Total items updated: ${updatedCount}/${items.length}`);
}

refetchAllItems();
