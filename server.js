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

    let title = '';
    let image = '';
    let price = '';
    let description = '';

    // 1. Shopify API Check (fast & reliable for many e-commerce stores)
    if (targetUrl.includes('/products/')) {
      try {
        const cleanUrl = targetUrl.split('?')[0].replace(/\/$/, '');
        const jsonRes = await fetch(cleanUrl + '.json', {
          headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36' }
        });
        if (jsonRes.ok) {
          const data = await jsonRes.json();
          if (data.product) {
            title = data.product.title || '';
            if (data.product.images && data.product.images.length > 0) {
              const src = data.product.images[0].src;
              image = src.startsWith('//') ? 'https:' + src : src;
            }
            if (data.product.variants && data.product.variants.length > 0) {
              const p = data.product.variants[0].price;
              if (p) price = `£${p}`;
            }
            if (data.product.body_html) {
              description = data.product.body_html.replace(/<[^>]+>/g, ' ').substring(0, 200).trim();
            }
          }
        }
      } catch (e) {
        console.warn('Shopify API fetch failed:', e.message);
      }
    }

    // 2. Amazon ASIN Check
    if (hostname.includes('amazon.')) {
      const asinMatch = targetUrl.match(/(?:dp|gp\/product|exec\/obidos\/asin)\/(B[0-9A-Z]{9})/i);
      if (asinMatch && asinMatch[1]) {
        const asin = asinMatch[1];
        if (!image || image.includes('logo') || image.includes('favicon')) {
          image = `https://images-na.ssl-images-amazon.com/images/P/${asin}.01.LZZZZZZZ.jpg`;
        }
      }
    }

    // 3. Direct HTML Scraping (OpenGraph, Twitter Cards, Meta, JSON-LD Schema)
    if (!title || !image || !price) {
      try {
        const htmlRes = await fetch(targetUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Cache-Control': 'no-cache'
          }
        });

        if (htmlRes.ok) {
          const html = await htmlRes.text();

          // OpenGraph / Twitter Title
          if (!title) {
            const ogTitle = html.match(/<meta[^>]+(?:property|name)=["'](?:og:title|twitter:title)["'][^>]+content=["']([^"']+)["']/i) ||
                            html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:og:title|twitter:title)["']/i);
            const titleTag = html.match(/<title[^>]*>([^<]+)<\/title>/i);
            const h1Tag = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);

            title = ogTitle ? ogTitle[1] : (titleTag ? titleTag[1] : (h1Tag ? h1Tag[1].replace(/<[^>]+>/g, '').trim() : ''));
          }

          // OpenGraph / Twitter Image
          if (!image || image.includes('favicon') || image.includes('logo')) {
            const ogImg = html.match(/<meta[^>]+(?:property|name)=["'](?:og:image|twitter:image|og:image:secure_url)["'][^>]+content=["']([^"']+)["']/i) ||
                          html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:og:image|twitter:image|og:image:secure_url)["']/i);
            if (ogImg && ogImg[1]) {
              let imgUrl = ogImg[1].replace(/&amp;/g, '&');
              if (imgUrl.startsWith('//')) imgUrl = 'https:' + imgUrl;
              if (imgUrl.startsWith('/')) imgUrl = `${urlObj.origin}${imgUrl}`;
              image = imgUrl;
            }
          }

          // OpenGraph / Meta Description
          if (!description) {
            const ogDesc = html.match(/<meta[^>]+(?:property|name)=["'](?:og:description|twitter:description|description)["'][^>]+content=["']([^"']+)["']/i) ||
                           html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:og:description|twitter:description|description)["']/i);
            if (ogDesc && ogDesc[1]) description = ogDesc[1];
          }

          // OpenGraph / Meta Price
          if (!price) {
            const ogPrice = html.match(/<meta[^>]+(?:property|name)=["'](?:og:price:amount|product:price:amount|twitter:label1)["'][^>]+content=["']([^"']+)["']/i) ||
                            html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:og:price:amount|product:price:amount|twitter:label1)["']/i);
            if (ogPrice && ogPrice[1]) {
              const rawP = ogPrice[1];
              price = rawP.startsWith('£') || rawP.startsWith('$') || rawP.startsWith('€') ? rawP : `£${rawP}`;
            }
          }

          // JSON-LD Product Microdata
          const jsonLdMatches = html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
          if (jsonLdMatches) {
            for (const block of jsonLdMatches) {
              try {
                const content = block.replace(/<script[^>]*>/i, '').replace(/<\/script>/i, '').trim();
                const json = JSON.parse(content);
                const items = Array.isArray(json) ? json : [json];
                for (const item of items) {
                  const target = item['@graph'] ? item['@graph'] : [item];
                  for (const sub of (Array.isArray(target) ? target : [target])) {
                    if (sub['@type'] === 'Product' || sub['@type'] === 'http://schema.org/Product') {
                      if (!title && sub.name) title = sub.name;
                      if (!image && sub.image) {
                        const imgVal = Array.isArray(sub.image) ? sub.image[0] : (typeof sub.image === 'object' ? sub.image.url : sub.image);
                        if (imgVal) image = imgVal;
                      }
                      if (!price && sub.offers) {
                        const offer = Array.isArray(sub.offers) ? sub.offers[0] : sub.offers;
                        if (offer && (offer.price || offer.lowPrice)) price = `£${offer.price || offer.lowPrice}`;
                      }
                      if (!description && sub.description) description = sub.description;
                    }
                  }
                }
              } catch (e) {}
            }
          }
        }
      } catch (e) {
        console.warn('Direct HTML scrape failed:', e.message);
      }
    }

    // 4. Microlink API Fallback
    if (!title || !image) {
      try {
        const mlRes = await fetch(`https://api.microlink.io?url=${encodeURIComponent(targetUrl)}&meta=true`);
        if (mlRes.ok) {
          const mlData = await mlRes.json();
          if (mlData.status === 'success' && mlData.data) {
            if (!title) title = mlData.data.title || '';
            if (!image) image = mlData.data.image?.url || (Array.isArray(mlData.data.images) ? mlData.data.images[0]?.url : '');
            if (!price && mlData.data.price) price = typeof mlData.data.price === 'number' ? `£${mlData.data.price}` : mlData.data.price;
            if (!description && mlData.data.description) description = mlData.data.description;
          }
        }
      } catch (e) {
        console.warn('Microlink error:', e.message);
      }
    }

    // 5. Slug Title Fallback if title is empty, brand-only, or generic
    const brandName = hostname.replace('www.', '').split('.')[0];
    const isGenericTitle = !title ||
      title.toLowerCase().trim() === hostname.replace('www.', '') ||
      title.toLowerCase().trim() === brandName ||
      ['page not found', 'access denied', 'attention required', '404', 'security check', 'just a moment', 'not found', 'error'].includes(title.toLowerCase().trim());

    if (isGenericTitle) {
      try {
        const pathParts = urlObj.pathname.split('/').filter(p => p && !['dp', 'gp', 'product', 'products', 'item', 'items', 'p', 'pd', 'prd'].includes(p.toLowerCase()));
        if (pathParts.length > 0) {
          let slug = pathParts[pathParts.length - 1];
          slug = slug.replace(/[-_]/g, ' ').replace(/\.(html|php|asp|aspx)$/i, '');
          if (slug.length > 2 && !/^[A-Z0-9]{10}$/i.test(slug)) {
            title = slug.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
          }
        }
      } catch (e) {}
    }

    const cleanedName = cleanTitle(title, targetUrl) || urlObj.hostname.replace('www.', '');

    // 6. Bing Image Fallback (if image is missing, favicon, or logo)
    if (cleanedName && (!image || image.includes('favicon') || image.includes('logo') || image.includes('s2/favicons'))) {
      try {
        const bingRes = await fetch(`https://www.bing.com/images/search?q=${encodeURIComponent(cleanedName + ' product photo')}`, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' }
        });
        if (bingRes.ok) {
          const html = await bingRes.text();
          const m = html.match(/murl&quot;:&quot;(https?:&#2f;&#2f;[^&]+)&quot;/i);
          if (m && m[1]) {
            image = m[1].replace(/&#2f;/g, '/');
          }
        }
      } catch (e) {}
    }

    // 7. Favicon Fallback if Bing search fails
    if (!image) {
      image = `https://www.google.com/s2/favicons?sz=256&domain=${hostname}`;
    }

    // Price extraction fallback from text
    if (!price) {
      price = parsePriceFromText(description + ' ' + title);
    }

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
