const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// --- HELPER FUNCTIONS FOR SCRAPING ---

function cleanTitle(title, urlStr) {
  if (!title) return '';
  let cleaned = title.trim();

  // Strip URL query parameters if present in title
  if (cleaned.includes('?')) cleaned = cleaned.split('?')[0];
  if (cleaned.includes('&') && (cleaned.includes('=') || cleaned.includes('utm_') || cleaned.includes('tw_'))) {
    cleaned = cleaned.split('&')[0];
  }

  // Strip generic site titles / suffixes after common separators
  const separators = [' | ', ' - ', ' – ', ' — ', ' : '];
  for (const sep of separators) {
    if (cleaned.includes(sep)) {
      const parts = cleaned.split(sep);
      const last = parts[parts.length - 1].toLowerCase();
      const genericWords = ['amazon', 'asos', 'zara', 'h&m', 'sephora', 'boots', 'ikea', 'official', 'store', 'shop', 'website', 'online'];
      if (genericWords.some(w => last.includes(w))) {
        parts.pop();
        cleaned = parts.join(sep);
      }
    }
  }

  cleaned = cleaned.replace(/:\s*Amazon\.co\.uk:.*$/i, '');
  cleaned = cleaned.replace(/\.(html|php|asp|aspx)$/i, '');
  cleaned = cleaned.replace(/[™®©]/g, '');
  cleaned = cleaned.replace(/\bSKU[:\s]*\w+/gi, '');

  if (cleaned.length > 90) {
    cleaned = cleaned.substring(0, 87) + '...';
  }

  return cleaned.trim();
}

function parsePriceFromText(text) {
  if (!text) return '';
  const regex = /(?:£|€|\$|USD|GBP|EUR)\s?[\d,.]+(?:\.\d{2})?|[\d,.]+(?:\.\d{2})?\s?(?:£|€|\$|USD|GBP|EUR)/i;
  const match = text.match(regex);
  if (match) return match[0];
  const numMatch = text.match(/[\d,]+\.\d{2}/);
  return numMatch ? `£${numMatch[0]}` : '';
}

function autoDetectCategory(title, urlStr, text) {
  const fullText = (title + ' ' + urlStr + ' ' + (text || '')).toLowerCase();
  
  if (fullText.includes('jewel') || fullText.includes('ring') || fullText.includes('necklace') || fullText.includes('earring') || fullText.includes('bracelet') || fullText.includes('pendant')) {
    return { category: 'jewellery', subcategory: '' };
  }
  if (fullText.includes('shoe') || fullText.includes('boot') || fullText.includes('trainer') || fullText.includes('sneaker') || fullText.includes('sandal') || fullText.includes('heel') || fullText.includes('loafer')) {
    return { category: 'shoes', subcategory: '' };
  }
  if (fullText.includes('bag') || fullText.includes('handbag') || fullText.includes('tote') || fullText.includes('backpack') || fullText.includes('clutch') || fullText.includes('purse')) {
    return { category: 'bags', subcategory: '' };
  }
  if (fullText.includes('lip') || fullText.includes('serum') || fullText.includes('cream') || fullText.includes('makeup') || fullText.includes('perfume') || fullText.includes('fragrance') || fullText.includes('shampoo') || fullText.includes('mascara') || fullText.includes('lipstick') || fullText.includes('skincare')) {
    return { category: 'cosmetics', subcategory: '' };
  }
  if (fullText.includes('book') || fullText.includes('novel') || fullText.includes('paperback') || fullText.includes('hardcover')) {
    return { category: 'books', subcategory: '' };
  }
  if (fullText.includes('pen') || fullText.includes('notebook') || fullText.includes('journal') || fullText.includes('planner') || fullText.includes('paper')) {
    return { category: 'stationery', subcategory: '' };
  }
  if (fullText.includes('chair') || fullText.includes('table') || fullText.includes('lamp') || fullText.includes('candle') || fullText.includes('cushion') || fullText.includes('vase') || fullText.includes('rug') || fullText.includes('decor')) {
    return { category: 'home', subcategory: '' };
  }

  // Clothes & Subcategories
  let subcat = 'other';
  if (fullText.includes('t-shirt') || fullText.includes('tee')) subcat = 't-shirts';
  else if (fullText.includes('jumper') || fullText.includes('sweater') || fullText.includes('knit') || fullText.includes('cardigan')) subcat = 'jumpers';
  else if (fullText.includes('hoodie') || fullText.includes('sweatshirt')) subcat = 'hoodies';
  else if (fullText.includes('jacket') || fullText.includes('coat') || fullText.includes('blazer') || fullText.includes('trench')) subcat = 'jackets';
  else if (fullText.includes('dress')) subcat = 'dresses';
  else if (fullText.includes('skirt')) subcat = 'skirts';
  else if (fullText.includes('trouser') || fullText.includes('jean') || fullText.includes('pants') || fullText.includes('legging')) subcat = 'trousers';
  else if (fullText.includes('short')) subcat = 'shorts';
  else if (fullText.includes('activewear') || fullText.includes('gym') || fullText.includes('sports bra')) subcat = 'activewear';
  else if (fullText.includes('bikini') || fullText.includes('swimsuit') || fullText.includes('swimwear')) subcat = 'swimwear';
  else if (fullText.includes('pyjama') || fullText.includes('pajama') || fullText.includes('loungewear') || fullText.includes('underwear') || fullText.includes('bra') || fullText.includes('knickers')) subcat = 'underwear';
  else if (fullText.includes('scarf') || fullText.includes('hat') || fullText.includes('belt') || fullText.includes('sunglasses') || fullText.includes('socks')) subcat = 'accessories';
  else if (fullText.includes('top') || fullText.includes('blouse') || fullText.includes('shirt')) subcat = 'tops';

  const isClothes = subcat !== 'other' || fullText.includes('wear') || fullText.includes('clothing') || fullText.includes('fashion') || fullText.includes('fit') || fullText.includes('size');
  if (isClothes) {
    return { category: 'clothes', subcategory: subcat };
  }

  return { category: 'misc', subcategory: '' };
}

// Scrape URL endpoint
app.get('/api/scrape', async (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl) {
    return res.status(400).json({ error: 'Missing url parameter' });
  }

  try {
    const urlObj = new URL(targetUrl);
    const hostname = urlObj.hostname.toLowerCase();

    // 1. Try fetching via Microlink API
    let meta = null;
    try {
      const mlRes = await fetch(`https://api.microlink.io?url=${encodeURIComponent(targetUrl)}&meta=true`);
      if (mlRes.ok) {
        const mlData = await mlRes.json();
        if (mlData.status === 'success' && mlData.data) {
          meta = mlData.data;
        }
      }
    } catch (e) {
      console.warn('Microlink error:', e.message);
    }

    // 2. Domain Specific Parsers
    let title = meta?.title || '';
    let image = meta?.image?.url || (Array.isArray(meta?.images) ? meta.images[0]?.url : '');
    let price = meta?.price ? (typeof meta.price === 'number' ? `£${meta.price}` : meta.price) : '';
    let description = meta?.description || '';

    // Amazon domain parser
    if (hostname.includes('amazon.')) {
      const asinMatch = targetUrl.match(/(?:dp|gp\/product|exec\/obidos\/asin)\/(B[0-9A-Z]{9})/i);
      if (asinMatch && asinMatch[1]) {
        const asin = asinMatch[1];
        if (!image || image.includes('favicon') || image.includes('logo')) {
          image = `https://images-na.ssl-images-amazon.com/images/I/${asin}.jpg`;
        }
      }
    }

    // Fallback image search using DuckDuckGo / Bing if missing or poor quality
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

    // Fallback favicon image
    if (!image) {
      image = `https://www.google.com/s2/favicons?sz=256&domain=${hostname}`;
    }

    // Price extraction fallback
    if (!price) {
      price = parsePriceFromText(description + ' ' + title);
    }

    const cleanedName = cleanTitle(title, targetUrl) || urlObj.hostname.replace('www.', '');
    const { category, subcategory } = autoDetectCategory(cleanedName, targetUrl, description);

    return res.json({
      title: cleanedName,
      image: image,
      price: price,
      category: category,
      subcategory: subcategory,
      description: description,
      domain: hostname.replace('www.', '')
    });
  } catch (err) {
    console.error('Scrape error:', err);
    return res.status(500).json({ error: 'Failed to scrape metadata', details: err.message });
  }
});

// Start server
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
