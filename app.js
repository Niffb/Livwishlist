// ============================================
//  WISHLIST — App Logic
// ============================================

(function () {
    'use strict';

    // --- Constants ---
    const STORAGE_KEY = 'wishlist_items';
    const MICROLINK_API = 'https://api.microlink.io';
    const CATEGORIES = ['clothes', 'jewellery', 'shoes', 'bags', 'cosmetics', 'stationery', 'home', 'books', 'misc'];
    const CATEGORY_LABELS = {
        clothes: 'Clothes',
        jewellery: 'Jewellery',
        shoes: 'Shoes',
        bags: 'Bags',
        cosmetics: 'Cosmetics',
        stationery: 'Stationery',
        home: 'Home',
        books: 'Books',
        misc: 'Miscellaneous',
    };

    const SUBCATEGORY_LABELS = {
        tops: 'Tops',
        't-shirts': 'T-Shirts',
        jumpers: 'Jumpers & Knitwear',
        hoodies: 'Hoodies & Sweatshirts',
        jackets: 'Jackets & Coats',
        dresses: 'Dresses',
        skirts: 'Skirts',
        trousers: 'Trousers & Jeans',
        shorts: 'Shorts',
        activewear: 'Activewear',
        swimwear: 'Swimwear',
        underwear: 'Underwear & Loungewear',
        accessories: 'Accessories',
        other: 'Other',
    };

    // ==========================================
    //  SUPABASE CONFIGURATION
    // ==========================================
    // IMPORTANT: Replace these with your actual Supabase URL and Anon Key
    const SUPABASE_URL = 'https://tzhmcojnjnjtdrhkpdph.supabase.co';
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR6aG1jb2puam5qdGRyaGtwZHBoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE1MTIzMTYsImV4cCI6MjA4NzA4ODMxNn0.VhcR5YpvUglBbwqvw9FtM9l-s3H1IVFJZFAFMyZPshU';
    const ADMIN_PASSWORD = 'Pastore33!'; // Change this to your preferred password

    let supabase = null;
    if (SUPABASE_URL !== 'YOUR_SUPABASE_URL') {
        supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    }

    // --- DOM References ---
    const grid = document.getElementById('wishlistGrid');
    const emptyState = document.getElementById('emptyState');
    const addBtn = document.getElementById('addBtn');
    const modalOverlay = document.getElementById('modalOverlay');
    const modalClose = document.getElementById('modalClose');
    const itemForm = document.getElementById('itemForm');
    const toast = document.getElementById('toast');
    const toastUndo = document.getElementById('toastUndo');
    const tabs = document.querySelectorAll('.cat-tab');
    const fetchBtn = document.getElementById('fetchBtn');
    const fetchSpinner = document.getElementById('fetchSpinner');
    const fetchPreview = document.getElementById('fetchPreview');
    const fetchPreviewImg = document.getElementById('fetchPreviewImg');
    const fetchPreviewTitle = document.getElementById('fetchPreviewTitle');
    const fetchPreviewDesc = document.getElementById('fetchPreviewDesc');

    // Auth DOM
    const authBtn = document.getElementById('authBtn');
    const authModalOverlay = document.getElementById('authModalOverlay');
    const authModalClose = document.getElementById('authModalClose');
    const authForm = document.getElementById('authForm');
    const authPasswordInput = document.getElementById('authPassword');
    const authMessage = document.getElementById('authMessage');
    const authSubmitBtn = document.getElementById('authSubmitBtn');
    const userDisplay = document.getElementById('userDisplay');
    const userEmailSpan = document.getElementById('userEmail');
    const logoutBtn = document.getElementById('logoutBtn');

    // --- State ---
    let items = [];
    let activeCategory = 'all';
    let activeSort = 'newest';
    let lastDeleted = null;
    let toastTimeout = null;
    let currentUser = null;
    let editingItemId = null;

    const sortSelect = document.getElementById('sortSelect');
    const formSubmitBtn = document.getElementById('formSubmitBtn');
    const subcategoryGroup = document.getElementById('subcategoryGroup');
    const subcategorySelect = document.getElementById('itemSubcategory');
    const categorySelect = document.getElementById('itemCategory');

    // Show/hide subcategory when category changes
    categorySelect.addEventListener('change', () => {
        subcategoryGroup.style.display = categorySelect.value === 'clothes' ? 'block' : 'none';
        if (categorySelect.value !== 'clothes') subcategorySelect.value = '';
    });

    // --- Supabase Data Sync ---
    async function loadItems() {
        if (!supabase) {
            // Fallback to localStorage if Supabase isn't configured yet
            try {
                const data = localStorage.getItem(STORAGE_KEY);
                return data ? JSON.parse(data) : [];
            } catch {
                return [];
            }
        }

        const { data, error } = await supabase
            .from('wishlist')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error loading items:', error);
            return [];
        }

        // Map snake_case from DB back to camelCase for app logic
        return data.map(item => ({
            ...item,
            createdAt: item.created_at
        }));
    }

    async function saveItem(item) {
        if (!supabase) {
            items.unshift(item);
            localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
            return;
        }

        // Map camelCase to snake_case for DB
        const dbItem = { ...item, created_at: item.createdAt };
        delete dbItem.createdAt;
        delete dbItem.subcategory; // Not in DB schema yet

        const { error } = await supabase
            .from('wishlist')
            .insert([dbItem]);

        if (error) console.error('Error saving item:', error);
    }

    async function removeItem(id) {
        if (!supabase) {
            const index = items.findIndex(i => i.id === id);
            if (index > -1) {
                lastDeleted = { item: items[index], index };
                items.splice(index, 1);
                localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
            }
            return;
        }

        const { error } = await supabase
            .from('wishlist')
            .delete()
            .eq('id', id);

        if (error) console.error('Error removing item:', error);
    }

    async function updateItem(id, updates) {
        if (!supabase) {
            const index = items.findIndex(i => i.id === id);
            if (index > -1) {
                items[index] = { ...items[index], ...updates };
                localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
            }
            return;
        }

        // Map camelCase to snake_case for DB
        const dbUpdates = { ...updates };
        if (dbUpdates.createdAt) {
            dbUpdates.created_at = dbUpdates.createdAt;
            delete dbUpdates.createdAt;
        }
        delete dbUpdates.subcategory; // Not in DB schema yet

        const { error } = await supabase
            .from('wishlist')
            .update(dbUpdates)
            .eq('id', id);

        if (error) console.error('Error updating item:', error);
    }

    function subscribeToChanges() {
        if (!supabase) return;

        supabase
            .channel('public:wishlist')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'wishlist' }, async () => {
                items = await loadItems();
                render();
            })
            .subscribe();
    }

    // --- Generate unique ID ---
    function uid() {
        return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    }

    // --- Extract display URL ---
    function displayUrl(url) {
        try {
            const u = new URL(url);
            return u.hostname.replace('www.', '');
        } catch {
            return url;
        }
    }

    // --- Escape HTML ---
    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // --- Clean Title Helper ---
    function cleanTitle(title, url) {
        if (!title) return '';

        // Strip common suffixes/prefixes like site names
        let cleaned = title;

        // 1. Remove separators and what follows them if they look like site names
        // e.g., "Product Name | Site Name" or "Product Name - Brand"
        const separators = [' | ', ' - ', ' – ', ' — ', ' : '];
        for (const sep of separators) {
            if (cleaned.includes(sep)) {
                const parts = cleaned.split(sep);
                // If the second part contains common site words or matches domain, take the first part
                const lastPart = parts[parts.length - 1].toLowerCase();
                if (lastPart.includes('store') || lastPart.includes('official') || lastPart.includes('website') ||
                    (url && url.toLowerCase().includes(lastPart.replace(/\s/g, '')))) {
                    cleaned = parts.slice(0, -1).join(sep);
                }
            }
        }

        cleaned = cleaned.trim();

        // 2. If it's a long hyphenated string (slug) or contains path segments
        if (cleaned.includes('/') || (cleaned.includes('-') && !cleaned.includes(' '))) {
            const segments = cleaned.split('/');
            cleaned = segments[segments.length - 1] || segments[segments.length - 2] || cleaned;

            cleaned = cleaned
                .split('-')
                .filter((part) => {
                    // Remove purely numeric parts (IDs) and very short segments
                    return !/^\d+$/.test(part) && part.length > 1;
                })
                .join(' ');
        }

        // 3. Capitalize and cleanup
        if (cleaned) {
            cleaned = cleaned
                .toLowerCase()
                .split(' ')
                .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
                .join(' ')
                .trim();
        }

        return cleaned;
    }

    // ==========================================
    //  SMART FETCH — Microlink API + Fallbacks
    // ==========================================

    // Parse product name from URL slug (last resort fallback)
    function parseNameFromUrl(url) {
        try {
            const u = new URL(url);
            const pathParts = u.pathname.split('/').filter(Boolean);
            // Find the most descriptive part (longest, non-numeric segment)
            let best = '';
            for (const part of pathParts) {
                // Skip purely numeric parts (IDs)
                if (/^\d+$/.test(part)) continue;
                // Skip common path segments
                if (['uk', 'us', 'listing', 'product', 'products', 'item', 'items', 'shop', 'dp', 'p'].includes(part.toLowerCase())) continue;
                if (part.length > best.length) best = part;
            }
            if (best) {
                return best
                    .replace(/[-_]+/g, ' ')
                    .replace(/\b\w/g, c => c.toUpperCase())
                    .trim();
            }
        } catch (e) { }
        return '';
    }

    // Try fetching metadata from Microlink
    async function fetchFromMicrolink(url) {
        try {
            const response = await fetch(
                `${MICROLINK_API}?url=${encodeURIComponent(url)}&palette=true`
            );
            const json = await response.json();
            if (json.status === 'success' && json.data) {
                return json.data;
            }
        } catch (e) {
            // Silently fail — some sites block Microlink
        }
        return null;
    }

    fetchBtn.addEventListener('click', async () => {
        let url = document.getElementById('itemUrl').value.trim();
        if (!url) {
            document.getElementById('itemUrl').focus();
            return;
        }

        // Start loading
        fetchBtn.classList.add('loading');
        fetchBtn.disabled = true;
        fetchPreview.classList.remove('show');

        try {
            // Strategy 1: Try Microlink
            let data = await fetchFromMicrolink(url);

            if (data) {
                const nameInput = document.getElementById('itemName');
                const imageInput = document.getElementById('itemImage');
                const priceInput = document.getElementById('itemPrice');

                // Clean and Set Name
                const cleanedTitle = cleanTitle(data.title, url);
                if (cleanedTitle && cleanedTitle.length > 3) {
                    nameInput.value = cleanedTitle;
                } else if (data.description) {
                    const descTitle = cleanTitle(data.description.split('.')[0], url);
                    if (descTitle && descTitle.length < 80) nameInput.value = descTitle;
                }

                // Set Image - Smarter selection
                let bestImage = '';

                // Helper to normalize URLs
                const normalizeUrl = (imgUrl) => {
                    if (!imgUrl) return null;
                    if (typeof imgUrl === 'object') imgUrl = imgUrl.url;
                    if (typeof imgUrl !== 'string') return null;
                    try {
                        return new URL(imgUrl, url).href;
                    } catch (e) {
                        return imgUrl;
                    }
                };

                const imageCandidates = [
                    data.image,
                    ...(Array.isArray(data.images) ? data.images : []),
                    data.logo,
                    data.screenshot
                ]
                    .map(normalizeUrl)
                    .filter(img => img && img.length > 4 && !img.toLowerCase().includes('favicon'));

                if (imageCandidates.length > 0) {
                    bestImage = imageCandidates[0];
                }

                if (bestImage) {
                    imageInput.value = bestImage;
                }

                // Set Price - More aggressive detection
                let detectedPrice = '';
                if (data.price) {
                    detectedPrice = typeof data.price === 'number' ? `£${data.price}` : data.price;
                } else {
                    // Combine all text data to search for currency patterns
                    const searchStr = [
                        data.description || '',
                        data.title || '',
                        data.publisher || '',
                        typeof data.text === 'string' ? data.text : ''
                    ].join(' | ');

                    // Specific regex for currency symbols
                    const currencyRegex = /(?:£|€|\$|USD|GBP|EUR|¥|CHF|AUD|CAD)\s?[\d,.]+(?:\.\d{2})?|[\d,.]+(?:\.\d{2})?\s?(?:£|€|\$|USD|GBP|EUR|¥|CHF|AUD|CAD)/i;
                    const priceMatch = searchStr.match(currencyRegex);

                    if (priceMatch) {
                        detectedPrice = priceMatch[0];
                    }
                }

                if (detectedPrice) {
                    priceInput.value = detectedPrice;
                }

                // Show preview card
                if (bestImage) {
                    fetchPreviewImg.src = bestImage;
                    fetchPreviewImg.style.display = 'block';
                } else {
                    fetchPreviewImg.style.display = 'none';
                }

                fetchPreviewTitle.textContent = nameInput.value || 'Product detected';
                fetchPreviewDesc.textContent = detectedPrice
                    ? `Price: ${detectedPrice}`
                    : (data.description ? data.description.substring(0, 100) + '...' : url);
                fetchPreview.classList.add('show');
            } else {
                // Strategy 3: Parse product name from URL slug
                const parsedName = parseNameFromUrl(url);
                const nameInput = document.getElementById('itemName');
                if (parsedName) {
                    nameInput.value = parsedName;
                }

                fetchPreviewTitle.textContent = parsedName || 'Could not auto-fetch';
                fetchPreviewDesc.textContent = 'This site blocks scrapers. Name was extracted from the URL — please verify and fill in the rest manually.';
                fetchPreviewImg.style.display = 'none';
                fetchPreview.classList.add('show');
            }
        } catch (err) {
            // Final fallback on network error
            const parsedName = parseNameFromUrl(url);
            const nameInput = document.getElementById('itemName');
            if (parsedName) {
                nameInput.value = parsedName;
            }
            fetchPreviewTitle.textContent = parsedName || 'Fetch failed';
            fetchPreviewDesc.textContent = 'Please check the link or fill in manually.';
            fetchPreviewImg.style.display = 'none';
            fetchPreview.classList.add('show');
        } finally {
            fetchBtn.classList.remove('loading');
            fetchBtn.disabled = false;
        }
    });

    // ==========================================
    //  RENDER
    // ==========================================

    function parsePrice(priceStr) {
        if (!priceStr) return Infinity;
        const cleaned = priceStr.replace(/[^\d.]/g, '');
        const val = parseFloat(cleaned);
        return isNaN(val) ? Infinity : val;
    }

    function getPlaceholderIcon(category) {
        const icons = {
            clothes: '👕',
            jewellery: '💎',
            shoes: '👟',
            bags: '👜',
            cosmetics: '💄',
            stationery: '✍️',
            home: '🏠',
            books: '📖',
            misc: '✦'
        };
        return icons[category] || '✦';
    }

    function render() {
        let filtered =
            activeCategory === 'all'
                ? [...items]
                : items.filter((item) => item.category === activeCategory);

        // Apply sorting
        switch (activeSort) {
            case 'newest':
                filtered.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
                break;
            case 'oldest':
                filtered.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
                break;
            case 'price-low':
                filtered.sort((a, b) => parsePrice(a.price) - parsePrice(b.price));
                break;
            case 'price-high':
                filtered.sort((a, b) => parsePrice(b.price) - parsePrice(a.price));
                break;
            case 'name':
                filtered.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
                break;
        }

        grid.innerHTML = '';

        if (filtered.length === 0) {
            emptyState.style.display = 'block';
            grid.style.display = 'none';
            const emptyText = emptyState.querySelector('.empty-text');
            if (activeCategory === 'all') {
                emptyText.textContent = 'No items yet';
            } else {
                emptyText.textContent = `No ${CATEGORY_LABELS[activeCategory] || activeCategory} items`;
            }
        } else {
            emptyState.style.display = 'none';
            grid.style.display = 'grid';

            // If viewing Clothes category, group by subcategory
            const shouldGroup = activeCategory === 'clothes';

            if (shouldGroup) {
                // Group items by subcategory
                const groups = {};
                const ungrouped = [];
                filtered.forEach(item => {
                    const sub = item.subcategory || '';
                    if (sub) {
                        if (!groups[sub]) groups[sub] = [];
                        groups[sub].push(item);
                    } else {
                        ungrouped.push(item);
                    }
                });

                // Render order: sorted subcategory keys, then ungrouped
                const orderedKeys = Object.keys(SUBCATEGORY_LABELS).filter(k => groups[k]);
                // Add any keys not in SUBCATEGORY_LABELS
                Object.keys(groups).forEach(k => { if (!orderedKeys.includes(k)) orderedKeys.push(k); });

                let globalIndex = 0;
                orderedKeys.forEach(key => {
                    const header = document.createElement('div');
                    header.className = 'subcategory-header';
                    header.textContent = SUBCATEGORY_LABELS[key] || key;
                    grid.appendChild(header);

                    groups[key].forEach(item => {
                        grid.appendChild(createCard(item, globalIndex++));
                    });
                });

                if (ungrouped.length > 0) {
                    if (orderedKeys.length > 0) {
                        const header = document.createElement('div');
                        header.className = 'subcategory-header';
                        header.textContent = 'Uncategorised';
                        grid.appendChild(header);
                    }
                    ungrouped.forEach(item => {
                        grid.appendChild(createCard(item, globalIndex++));
                    });
                }
            } else {
                filtered.forEach((item, i) => {
                    grid.appendChild(createCard(item, i));
                });
            }
        }
    }

    function createCard(item, i) {
        const card = document.createElement('div');
        card.className = 'wish-card';
        card.style.animationDelay = `${i * 0.04}s`;

        const priceHtml = item.price
            ? `<div class="wish-card-price">${escapeHtml(item.price)}</div>`
            : '';
        const noteHtml = item.note
            ? `<div class="wish-card-note">${escapeHtml(item.note)}</div>`
            : '';
        const imageHtml = item.image
            ? `<img class="wish-card-image" src="${escapeHtml(item.image)}" alt="${escapeHtml(item.name)}" onerror="this.parentElement.classList.add('no-image'); this.remove();">`
            : '';
        const placeholderIcon = getPlaceholderIcon(item.category);
        const subcatHtml = item.subcategory && SUBCATEGORY_LABELS[item.subcategory]
            ? `<span class="wish-card-subcategory">${SUBCATEGORY_LABELS[item.subcategory]}</span>`
            : '';

        card.innerHTML = `
          <div class="wish-card-image-container">
            ${imageHtml}
            <div class="wish-card-placeholder">${placeholderIcon}</div>
          </div>
          <div class="wish-card-body">
            <div class="wish-card-content">
              <div class="wish-card-name">${escapeHtml(item.name)}</div>
              <span class="wish-card-category">${CATEGORY_LABELS[item.category] || item.category}</span>
              ${subcatHtml}
              ${priceHtml}
              ${noteHtml}
              <a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer" class="wish-card-url" onclick="event.stopPropagation()">
                ${displayUrl(item.url)}
              </a>
            </div>
            <div class="wish-card-actions">
              <button class="btn-edit" data-id="${item.id}" aria-label="Edit item">✎</button>
              <button class="btn-delete" data-id="${item.id}" aria-label="Delete item">&times;</button>
            </div>
          </div>
        `;

        card.addEventListener('click', (e) => {
            if (
                e.target.closest('.btn-delete') ||
                e.target.closest('.btn-edit') ||
                e.target.closest('.wish-card-url')
            )
                return;
            window.open(item.url, '_blank', 'noopener,noreferrer');
        });

        return card;
    }

    // ==========================================
    //  TABS
    // ==========================================

    tabs.forEach((tab) => {
        tab.addEventListener('click', () => {
            tabs.forEach((t) => t.classList.remove('active'));
            tab.classList.add('active');
            activeCategory = tab.dataset.category;
            render();
        });
    });

    // Sort listener
    sortSelect.addEventListener('change', () => {
        activeSort = sortSelect.value;
        render();
    });

    // ==========================================
    //  MODAL
    // ==========================================

    function openModal() {
        modalOverlay.classList.add('open');
        addBtn.classList.add('open');
        document.body.style.overflow = 'hidden';
        setTimeout(() => {
            document.getElementById('itemUrl').focus();
        }, 350);
    }

    function closeModal() {
        modalOverlay.classList.remove('open');
        addBtn.classList.remove('open');
        document.body.style.overflow = '';
        itemForm.reset();
        fetchPreview.classList.remove('show');
        subcategoryGroup.style.display = 'none';
        subcategorySelect.value = '';
        // Reset edit state
        if (editingItemId) {
            editingItemId = null;
            formSubmitBtn.textContent = 'Add Item';
            document.querySelector('.modal-title').textContent = 'Add to Wishlist';
        }
    }

    addBtn.addEventListener('click', () => {
        if (modalOverlay.classList.contains('open')) {
            closeModal();
        } else {
            openModal();
        }
    });

    modalClose.addEventListener('click', closeModal);

    modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) closeModal();
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (modalOverlay.classList.contains('open')) closeModal();
            if (authModalOverlay.classList.contains('open')) closeAuthModal();
        }
    });

    // ==========================================
    //  AUTHENTICATION FLOW
    // ==========================================

    function openAuthModal() {
        authModalOverlay.classList.add('open');
        document.body.style.overflow = 'hidden';
        setTimeout(() => authPasswordInput.focus(), 350);
    }

    function closeAuthModal() {
        authModalOverlay.classList.remove('open');
        document.body.style.overflow = '';
        authForm.reset();
        authMessage.style.display = 'none';
        authMessage.className = 'auth-message';
    }

    authBtn.addEventListener('click', openAuthModal);
    authModalClose.addEventListener('click', closeAuthModal);

    authModalOverlay.addEventListener('click', (e) => {
        if (e.target === authModalOverlay) closeAuthModal();
    });

    // Handle Login (Password Only)
    authForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const password = authPasswordInput.value.trim();

        if (password === ADMIN_PASSWORD) {
            currentUser = { email: 'Admin (Hardcoded)', id: 'admin' };
            localStorage.setItem('wishlist_admin_session', 'true');
            updateAuthUI();
            authMessage.textContent = 'Welcome back, Liv!';
            authMessage.className = 'auth-message success';
            authMessage.style.display = 'block';
            setTimeout(closeAuthModal, 1500);
        } else {
            authMessage.textContent = 'Incorrect password.';
            authMessage.className = 'auth-message error';
            authMessage.style.display = 'block';
        }
    });

    // Logout
    logoutBtn.addEventListener('click', async () => {
        localStorage.removeItem('wishlist_admin_session');
        currentUser = null;
        updateAuthUI();
        if (supabase) await supabase.auth.signOut();
    });

    if (supabase) {
        // Handle Auth State Changes
        supabase.auth.onAuthStateChange((event, session) => {
            if (currentUser?.id === 'admin') return; // Don't override admin session
            currentUser = session?.user || null;
            updateAuthUI();
        });
    }

    function updateAuthUI() {
        if (currentUser) {
            document.body.classList.add('is-authenticated');
            authBtn.style.display = 'none';
            userDisplay.style.display = 'flex';
            userEmailSpan.textContent = currentUser.email;
        } else {
            document.body.classList.remove('is-authenticated');
            authBtn.style.display = 'block';
            userDisplay.style.display = 'none';
            userEmailSpan.textContent = '';
        }
        render(); // Re-render to show/hide delete buttons
    }

    // ==========================================
    //  ADD ITEM
    // ==========================================

    itemForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const name = document.getElementById('itemName').value.trim();
        const url = document.getElementById('itemUrl').value.trim();
        const note = document.getElementById('itemNote').value.trim();
        const category = document.getElementById('itemCategory').value;
        const price = document.getElementById('itemPrice').value.trim();
        const image = document.getElementById('itemImage').value.trim();
        const subcategory = category === 'clothes' ? subcategorySelect.value : '';

        if (!name || !url) return;

        if (editingItemId) {
            // Update existing item
            await updateItem(editingItemId, { name, url, note, category, price, image, subcategory });
            editingItemId = null;
            formSubmitBtn.textContent = 'Add Item';
            document.querySelector('.modal-title').textContent = 'Add to Wishlist';
        } else {
            // Create new item
            const newItem = {
                id: uid(),
                name,
                url,
                note,
                category,
                price,
                image,
                subcategory,
                createdAt: Date.now(),
            };
            await saveItem(newItem);
        }
        if (!supabase) {
            render();
        }
        closeModal();
    });

    // ==========================================
    //  EDIT ITEM
    // ==========================================

    grid.addEventListener('click', (e) => {
        const editBtn = e.target.closest('.btn-edit');
        if (!editBtn) return;

        e.stopPropagation();
        const id = editBtn.dataset.id;
        const item = items.find(i => i.id === id);
        if (!item) return;

        // Fill the form with existing data
        editingItemId = id;
        document.getElementById('itemUrl').value = item.url || '';
        document.getElementById('itemName').value = item.name || '';
        document.getElementById('itemImage').value = item.image || '';
        document.getElementById('itemNote').value = item.note || '';
        document.getElementById('itemCategory').value = item.category || 'misc';
        document.getElementById('itemPrice').value = item.price || '';
        // Handle subcategory
        if (item.category === 'clothes') {
            subcategoryGroup.style.display = 'block';
            subcategorySelect.value = item.subcategory || '';
        } else {
            subcategoryGroup.style.display = 'none';
            subcategorySelect.value = '';
        }
        formSubmitBtn.textContent = 'Update Item';
        document.querySelector('.modal-title').textContent = 'Edit Item';
        openModal();
    });

    // ==========================================
    //  DELETE ITEM
    // ==========================================

    grid.addEventListener('click', async (e) => {
        const deleteBtn = e.target.closest('.btn-delete');
        if (!deleteBtn) return;

        e.stopPropagation();
        const id = deleteBtn.dataset.id;

        await removeItem(id);
        if (!supabase) {
            render();
            showToast();
        }
    });

    // ==========================================
    //  TOAST WITH UNDO
    // ==========================================

    function showToast() {
        clearTimeout(toastTimeout);
        toast.classList.add('show');
        toastTimeout = setTimeout(() => {
            toast.classList.remove('show');
            lastDeleted = null;
        }, 4000);
    }

    toastUndo.addEventListener('click', async () => {
        if (!lastDeleted) return;

        if (!supabase) {
            items.splice(lastDeleted.index, 0, lastDeleted.item);
            localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
        } else {
            await saveItem(lastDeleted.item);
        }

        lastDeleted = null;
        toast.classList.remove('show');
        clearTimeout(toastTimeout);
        if (!supabase) render();
    });

    // --- Boot ---
    async function init() {
        items = await loadItems();
        render();

        // Check for hardcoded session first
        if (localStorage.getItem('wishlist_admin_session') === 'true') {
            currentUser = { email: 'Admin (Hardcoded)', id: 'admin' };
            updateAuthUI();
        }

        if (supabase) {
            const { data: { session } } = await supabase.auth.getSession();
            if (!currentUser) { // Only set if not already admin
                currentUser = session?.user || null;
                updateAuthUI();
            }
            subscribeToChanges();
        }
    }

    init();
})();
