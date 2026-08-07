// ============================================
//  WISHLIST — App Logic (Liv's Wishlist)
// ============================================

(function () {
    'use strict';

    // --- Constants ---
    const CATEGORY_LABELS = {
        priority: 'Priority',
        clothes: 'Clothes',
        jewellery: 'Jewellery',
        shoes: 'Shoes',
        bags: 'Bags',
        cosmetics: 'Cosmetics',
        stationery: 'Stationery',
        home: 'Home',
        books: 'Books',
        misc: 'Miscellaneous',
        received: 'Received'
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
    //  API CONFIGURATION
    // ==========================================
    const SUPABASE_URL = 'https://tzhmcojnjnjtdrhkpdph.supabase.co';
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR6aG1jb2puam5qdGRyaGtwZHBoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE1MTIzMTYsImV4cCI6MjA4NzA4ODMxNn0.VhcR5YpvUglBbwqvw9FtM9l-s3H1IVFJZFAFMyZPshU';
    const ADMIN_PASSWORD = 'Pastore33!';

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
    const fetchPreview = document.getElementById('fetchPreview');
    const fetchPreviewImg = document.getElementById('fetchPreviewImg');
    const fetchPreviewTitle = document.getElementById('fetchPreviewTitle');
    const fetchPreviewDesc = document.getElementById('fetchPreviewDesc');

    // Controls DOM
    const headerSummary = document.getElementById('headerSummary');
    const searchInput = document.getElementById('searchInput');
    const priceFilter = document.getElementById('priceFilter');
    const sortSelect = document.getElementById('sortSelect');
    const shareBtn = document.getElementById('shareBtn');

    // Auth DOM
    const authBtn = document.getElementById('authBtn');
    const authModalOverlay = document.getElementById('authModalOverlay');
    const authModalClose = document.getElementById('authModalClose');
    const authForm = document.getElementById('authForm');
    const authPasswordInput = document.getElementById('authPassword');
    const authMessage = document.getElementById('authMessage');
    const userDisplay = document.getElementById('userDisplay');
    const userEmailSpan = document.getElementById('userEmail');
    const logoutBtn = document.getElementById('logoutBtn');

    // Claim Modal DOM
    const claimModalOverlay = document.getElementById('claimModalOverlay');
    const claimModalClose = document.getElementById('claimModalClose');
    const claimForm = document.getElementById('claimForm');
    const claimerNameInput = document.getElementById('claimerName');

    // Form inputs
    const formSubmitBtn = document.getElementById('formSubmitBtn');
    const subcategoryGroup = document.getElementById('subcategoryGroup');
    const subcategorySelect = document.getElementById('itemSubcategory');
    const categorySelect = document.getElementById('itemCategory');
    const priorityCheckbox = document.getElementById('itemPriority');
    const receivedCheckbox = document.getElementById('itemReceived');

    // --- State ---
    let items = [];
    let activeCategory = 'all';
    let activeSort = 'newest';
    let activePriceFilter = 'all';
    let searchQuery = '';
    let lastDeleted = null;
    let toastTimeout = null;
    let currentUser = null;
    let editingItemId = null;
    let claimingItemId = null;

    // Show/hide subcategory when category changes
    categorySelect.addEventListener('change', () => {
        subcategoryGroup.style.display = categorySelect.value === 'clothes' ? 'block' : 'none';
        if (categorySelect.value !== 'clothes') subcategorySelect.value = '';
    });

    // --- API Data Sync (Supabase) ---
    function getHeaders() {
        return {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json'
        };
    }

    async function loadItems() {
        try {
            const response = await fetch(`${SUPABASE_URL}/rest/v1/wishlist?select=*&order=created_at.desc`, {
                headers: getHeaders()
            });
            if (!response.ok) throw new Error('Failed to load items from Supabase');
            const data = await response.json();
            return data.map(item => ({
                ...item,
                createdAt: item.created_at
            }));
        } catch (error) {
            console.error('Error loading items from Supabase:', error);
            return [];
        }
    }

    async function saveItem(item) {
        const dbItem = { ...item, created_at: item.createdAt || Date.now() };
        delete dbItem.createdAt;

        try {
            const response = await fetch(`${SUPABASE_URL}/rest/v1/wishlist`, {
                method: 'POST',
                headers: getHeaders(),
                body: JSON.stringify(dbItem)
            });
            if (!response.ok) throw new Error('Failed to save item to Supabase');
            showToast('Item saved', false);
        } catch (error) {
            console.error('Error saving item to Supabase:', error);
            showToast('Failed to save', false);
            throw error;
        }
    }

    async function removeItem(id) {
        try {
            const index = items.findIndex(i => i.id === id);
            if (index > -1) {
                lastDeleted = { item: items[index], index };
            }

            const response = await fetch(`${SUPABASE_URL}/rest/v1/wishlist?id=eq.${id}`, { 
                method: 'DELETE',
                headers: getHeaders()
            });
            if (!response.ok) throw new Error('Failed to delete item from Supabase');
            
            showToast('Item removed', true);
        } catch (error) {
            console.error('Error removing item from Supabase:', error);
            showToast('Failed to remove', false);
            throw error;
        }
    }

    async function updateItem(id, updates) {
        const dbUpdates = { ...updates };
        if (dbUpdates.createdAt) {
            dbUpdates.created_at = dbUpdates.createdAt;
            delete dbUpdates.createdAt;
        }

        try {
            const response = await fetch(`${SUPABASE_URL}/rest/v1/wishlist?id=eq.${id}`, {
                method: 'PATCH',
                headers: getHeaders(),
                body: JSON.stringify(dbUpdates)
            });
            if (!response.ok) throw new Error('Failed to update item on Supabase');
            showToast('Item updated', false);
        } catch (error) {
            console.error('Error updating item on Supabase:', error);
            showToast('Failed to update', false);
            throw error;
        }
    }

    function uid() {
        return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    }

    function displayUrl(url) {
        try {
            const u = new URL(url);
            return u.hostname.replace('www.', '');
        } catch {
            return url;
        }
    }

    function escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function parsePrice(priceStr) {
        if (!priceStr) return Infinity;
        const cleaned = priceStr.replace(/[^\d.]/g, '');
        const val = parseFloat(cleaned);
        return isNaN(val) ? Infinity : val;
    }

    function getPlaceholderIcon(category) {
        return '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#cccccc" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>';
    }

    // --- Header Summary Calculation ---
    function updateSummary() {
        const activeItems = items.filter(item => !item.isReceived);
        const count = activeItems.length;
        let totalCost = 0;
        activeItems.forEach(item => {
            const p = parsePrice(item.price);
            if (p !== Infinity) totalCost += p;
        });
        headerSummary.textContent = `${count} ${count === 1 ? 'item' : 'items'} • £${totalCost.toFixed(2)}`;
    }

    // --- Scraper Call ---
    fetchBtn.addEventListener('click', async () => {
        let url = document.getElementById('itemUrl').value.trim();
        if (!url) return;

        if (!/^https?:\/\//i.test(url)) {
            url = 'https://' + url;
            document.getElementById('itemUrl').value = url;
        }

        fetchBtn.classList.add('loading');
        fetchBtn.disabled = true;
        fetchPreview.classList.remove('show');

        const nameInput = document.getElementById('itemName');
        const imageInput = document.getElementById('itemImage');
        const priceInput = document.getElementById('itemPrice');

        let data = null;

        // 1. Try Backend /api/scrape
        try {
            const res = await fetch(`/api/scrape?url=${encodeURIComponent(url)}`);
            if (res.ok) {
                data = await res.json();
            }
        } catch (err) {
            console.warn('Backend /api/scrape unavailable or failed, attempting client-side fallback:', err);
        }

        // 2. Client-side Fallback Scraper (for static hosts or backend offline)
        if (!data || (!data.title && !data.image)) {
            try {
                const urlObj = new URL(url);
                const hostname = urlObj.hostname.toLowerCase().replace('www.', '');
                let title = '';
                let image = '';
                let price = '';

                // Shopify API check
                if (url.includes('/products/')) {
                    try {
                        const cleanUrl = url.split('?')[0].replace(/\/$/, '');
                        const jsonRes = await fetch(cleanUrl + '.json');
                        if (jsonRes.ok) {
                            const shopifyData = await jsonRes.json();
                            if (shopifyData.product) {
                                title = shopifyData.product.title || '';
                                if (shopifyData.product.images && shopifyData.product.images.length > 0) {
                                    const src = shopifyData.product.images[0].src;
                                    image = src.startsWith('//') ? 'https:' + src : src;
                                }
                                if (shopifyData.product.variants && shopifyData.product.variants.length > 0) {
                                    const p = shopifyData.product.variants[0].price;
                                    if (p) price = `£${p}`;
                                }
                            }
                        }
                    } catch (e) {}
                }

                // Amazon ASIN check
                if (hostname.includes('amazon.')) {
                    const asinMatch = url.match(/(?:dp|gp\/product|exec\/obidos\/asin)\/(B[0-9A-Z]{9})/i);
                    if (asinMatch && asinMatch[1]) {
                        image = `https://images-na.ssl-images-amazon.com/images/P/${asinMatch[1]}.01.LZZZZZZZ.jpg`;
                    }
                }

                // Fallback title from URL path
                if (!title) {
                    const pathParts = urlObj.pathname.split('/').filter(Boolean);
                    if (pathParts.length > 0) {
                        const rawSlug = pathParts[pathParts.length - 1];
                        title = rawSlug.replace(/[-_]/g, ' ').replace(/\.(html|php|asp|aspx)$/i, '');
                        title = title.charAt(0).toUpperCase() + title.slice(1);
                    }
                }

                // Fallback favicon
                if (!image) {
                    image = `https://www.google.com/s2/favicons?sz=256&domain=${hostname}`;
                }

                data = {
                    title: title || hostname,
                    image: image,
                    price: price,
                    category: 'misc',
                    subcategory: '',
                    domain: hostname
                };
            } catch (e) {
                console.error('Client fallback error:', e);
            }
        }

        if (data) {
            if (data.title) nameInput.value = data.title;
            if (data.image) imageInput.value = data.image;
            if (data.price) priceInput.value = data.price;

            if (data.category) {
                categorySelect.value = data.category;
                if (data.category === 'clothes') {
                    subcategoryGroup.style.display = 'block';
                    if (data.subcategory) subcategorySelect.value = data.subcategory;
                }
            }

            if (data.image) {
                fetchPreviewImg.src = data.image;
                fetchPreviewImg.style.display = 'block';
            }
            fetchPreviewTitle.textContent = data.title || 'Product details extracted';
            fetchPreviewDesc.textContent = data.price ? `Price: ${data.price}` : 'Auto-filled standard fields';
            fetchPreview.classList.add('show');

            if (!data.price && !data.title) {
                showToast('Limited info extracted. Please complete details.', false);
            } else {
                showToast('Product details fetched!', false);
            }
        } else {
            showToast('Could not fetch URL. Please enter details manually.', false);
        }

        fetchBtn.classList.remove('loading');
        fetchBtn.disabled = false;
    });

    // --- Render Logic ---
    function render() {
        updateSummary();

        let filtered = [...items];

        // 1. Category Filter
        if (activeCategory === 'priority') {
            filtered = filtered.filter(item => item.isPriority);
        } else if (activeCategory === 'received') {
            filtered = filtered.filter(item => item.isReceived);
        } else if (activeCategory !== 'all') {
            filtered = filtered.filter(item => item.category === activeCategory && !item.isReceived);
        } else {
            // All tab: exclude received items
            filtered = filtered.filter(item => !item.isReceived);
        }

        // 2. Search Query
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            filtered = filtered.filter(item =>
                (item.name && item.name.toLowerCase().includes(q)) ||
                (item.note && item.note.toLowerCase().includes(q)) ||
                (item.url && item.url.toLowerCase().includes(q))
            );
        }

        // 3. Price Filter
        if (activePriceFilter !== 'all') {
            filtered = filtered.filter(item => {
                const p = parsePrice(item.price);
                if (p === Infinity) return false;
                if (activePriceFilter === 'under25') return p < 25;
                if (activePriceFilter === '25to50') return p >= 25 && p <= 50;
                if (activePriceFilter === 'over50') return p > 50;
                return true;
            });
        }

        // 4. Sorting
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
        } else {
            emptyState.style.display = 'none';
            grid.style.display = 'grid';

            filtered.forEach((item, i) => {
                grid.appendChild(createCard(item, i));
            });
        }
    }

    function createCard(item, i) {
        const card = document.createElement('div');
        card.className = 'wish-card';
        card.style.animationDelay = `${i * 0.04}s`;

        // Badges
        let badgesHtml = '';
        if (item.isPriority) badgesHtml += `<span class="badge badge-priority">Priority</span>`;
        if (item.claimedBy) badgesHtml += `<span class="badge badge-reserved">Reserved (${escapeHtml(item.claimedBy)})</span>`;
        if (item.isReceived) badgesHtml += `<span class="badge badge-received">Received</span>`;

        const priceHtml = item.price ? `<div class="wish-card-price">${escapeHtml(item.price)}</div>` : '';
        const noteHtml = item.note ? `<div class="wish-card-note">${escapeHtml(item.note)}</div>` : '';
        const imageHtml = item.image
            ? `<img class="wish-card-image" src="${escapeHtml(item.image)}" alt="${escapeHtml(item.name)}" onerror="this.parentElement.classList.add('no-image'); this.remove();">`
            : '';
        const placeholderIcon = getPlaceholderIcon(item.category);

        const reserveBtnText = item.claimedBy ? `Reserved by ${escapeHtml(item.claimedBy)}` : 'Reserve Gift';
        const reserveBtnClass = item.claimedBy ? 'btn-reserve reserved' : 'btn-reserve';

        card.innerHTML = `
          <div class="wish-card-image-container">
            <div class="card-badges">${badgesHtml}</div>
            ${imageHtml}
            <div class="wish-card-placeholder">${placeholderIcon}</div>
          </div>
          <div class="wish-card-body">
            <div class="wish-card-content">
              <div class="wish-card-name">${escapeHtml(item.name)}</div>
              <span class="wish-card-category">${CATEGORY_LABELS[item.category] || item.category}</span>
              ${item.subcategory ? `<span class="wish-card-subcategory">${SUBCATEGORY_LABELS[item.subcategory] || item.subcategory}</span>` : ''}
              ${priceHtml}
              ${noteHtml}
              <a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer" class="wish-card-url" onclick="event.stopPropagation()">
                ${displayUrl(item.url)}
              </a>
            </div>
            <div class="wish-card-actions">
              <button class="${reserveBtnClass}" data-claim-id="${item.id}">${reserveBtnText}</button>
              <button class="btn-edit" data-id="${item.id}">✎</button>
              <button class="btn-delete" data-id="${item.id}">&times;</button>
            </div>
          </div>
        `;

        card.addEventListener('click', (e) => {
            if (e.target.closest('.btn-delete') || e.target.closest('.btn-edit') || e.target.closest('.btn-reserve') || e.target.closest('.wish-card-url')) return;
            window.open(item.url, '_blank', 'noopener,noreferrer');
        });

        return card;
    }

    // --- Search & Filters Handlers ---
    searchInput.addEventListener('input', (e) => {
        searchQuery = e.target.value.trim();
        render();
    });

    priceFilter.addEventListener('change', () => {
        activePriceFilter = priceFilter.value;
        render();
    });

    sortSelect.addEventListener('change', () => {
        activeSort = sortSelect.value;
        render();
    });

    tabs.forEach((tab) => {
        tab.addEventListener('click', () => {
            tabs.forEach((t) => t.classList.remove('active'));
            tab.classList.add('active');
            activeCategory = tab.dataset.category;
            render();
        });
    });

    // --- Share Button ---
    shareBtn.addEventListener('click', () => {
        if (navigator.share) {
            navigator.share({
                title: "Liv's Wishlist",
                url: window.location.href
            }).catch(() => {});
        } else {
            navigator.clipboard.writeText(window.location.href);
            showToast('Wishlist link copied to clipboard!', false);
        }
    });

    // --- Reserve / Claim Flow ---
    grid.addEventListener('click', (e) => {
        const claimBtn = e.target.closest('.btn-reserve');
        if (!claimBtn) return;
        e.stopPropagation();

        const id = claimBtn.dataset.claimId;
        const item = items.find(i => i.id === id);
        if (!item) return;

        if (item.claimedBy) {
            // Already claimed -> option to unclaim
            if (confirm(`Unclaim gift reserved by ${item.claimedBy}?`)) {
                updateItem(id, { claimedBy: null }).then(async () => {
                    items = await loadItems();
                    render();
                });
            }
        } else {
            claimingItemId = id;
            claimModalOverlay.classList.add('open');
            setTimeout(() => claimerNameInput.focus(), 300);
        }
    });

    claimModalClose.addEventListener('click', () => claimModalOverlay.classList.remove('open'));
    claimForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = claimerNameInput.value.trim();
        if (!name || !claimingItemId) return;

        await updateItem(claimingItemId, { claimedBy: name });
        claimingItemId = null;
        claimerNameInput.value = '';
        claimModalOverlay.classList.remove('open');
        items = await loadItems();
        render();
    });

    // --- Add/Edit Modal Handlers ---
    function openModal() {
        modalOverlay.classList.add('open');
        addBtn.classList.add('open');
        setTimeout(() => document.getElementById('itemUrl').focus(), 300);
    }

    function closeModal() {
        modalOverlay.classList.remove('open');
        addBtn.classList.remove('open');
        itemForm.reset();
        fetchPreview.classList.remove('show');
        subcategoryGroup.style.display = 'none';
        if (editingItemId) {
            editingItemId = null;
            formSubmitBtn.textContent = 'Add Item';
            document.querySelector('.modal-title').textContent = 'Add to Wishlist';
        }
    }

    addBtn.addEventListener('click', openModal);
    modalClose.addEventListener('click', closeModal);

    itemForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('itemName').value.trim();
        const url = document.getElementById('itemUrl').value.trim();
        const note = document.getElementById('itemNote').value.trim();
        const category = document.getElementById('itemCategory').value;
        const price = document.getElementById('itemPrice').value.trim();
        const image = document.getElementById('itemImage').value.trim();
        const subcategory = category === 'clothes' ? subcategorySelect.value : '';
        const isPriority = priorityCheckbox.checked;
        const isReceived = receivedCheckbox.checked;

        if (!name || !url) return;

        if (editingItemId) {
            await updateItem(editingItemId, { name, url, note, category, price, image, subcategory, isPriority, isReceived });
            editingItemId = null;
        } else {
            const newItem = {
                id: uid(),
                name,
                url,
                note,
                category,
                price,
                image,
                subcategory,
                isPriority,
                isReceived,
                createdAt: Date.now(),
            };
            await saveItem(newItem);
        }

        items = await loadItems();
        render();
        closeModal();
    });

    grid.addEventListener('click', (e) => {
        const editBtn = e.target.closest('.btn-edit');
        if (!editBtn) return;
        e.stopPropagation();

        const id = editBtn.dataset.id;
        const item = items.find(i => i.id === id);
        if (!item) return;

        editingItemId = id;
        document.getElementById('itemUrl').value = item.url || '';
        document.getElementById('itemName').value = item.name || '';
        document.getElementById('itemImage').value = item.image || '';
        document.getElementById('itemNote').value = item.note || '';
        document.getElementById('itemCategory').value = item.category || 'misc';
        document.getElementById('itemPrice').value = item.price || '';
        priorityCheckbox.checked = !!item.isPriority;
        receivedCheckbox.checked = !!item.isReceived;

        if (item.category === 'clothes') {
            subcategoryGroup.style.display = 'block';
            subcategorySelect.value = item.subcategory || '';
        }

        formSubmitBtn.textContent = 'Update Item';
        document.querySelector('.modal-title').textContent = 'Edit Item';
        openModal();
    });

    grid.addEventListener('click', async (e) => {
        const deleteBtn = e.target.closest('.btn-delete');
        if (!deleteBtn) return;
        e.stopPropagation();

        const id = deleteBtn.dataset.id;
        await removeItem(id);
        items = await loadItems();
        render();
    });

    function showToast(message, showUndo = true) {
        clearTimeout(toastTimeout);
        toast.querySelector('.toast-text').textContent = message;
        toastUndo.style.display = showUndo ? 'inline-block' : 'none';
        toast.classList.add('show');
        toastTimeout = setTimeout(() => toast.classList.remove('show'), 4000);
    }

    toastUndo.addEventListener('click', async () => {
        if (!lastDeleted) return;
        await saveItem(lastDeleted.item);
        items = await loadItems();
        render();
        lastDeleted = null;
        toast.classList.remove('show');
    });

    // --- Auth Handlers ---
    authBtn.addEventListener('click', () => authModalOverlay.classList.add('open'));
    authModalClose.addEventListener('click', () => authModalOverlay.classList.remove('open'));
    authForm.addEventListener('submit', (e) => {
        e.preventDefault();
        if (authPasswordInput.value.trim() === ADMIN_PASSWORD) {
            currentUser = { email: 'Admin', id: 'admin' };
            localStorage.setItem('wishlist_admin_session', 'true');
            document.body.classList.add('is-authenticated');
            authBtn.style.display = 'none';
            userDisplay.style.display = 'flex';
            userEmailSpan.textContent = 'Admin Mode';
            authModalOverlay.classList.remove('open');
            render();
        } else {
            authMessage.textContent = 'Incorrect password.';
            authMessage.style.display = 'block';
        }
    });

    logoutBtn.addEventListener('click', () => {
        localStorage.removeItem('wishlist_admin_session');
        currentUser = null;
        document.body.classList.remove('is-authenticated');
        authBtn.style.display = 'block';
        userDisplay.style.display = 'none';
        render();
    });

    async function init() {
        items = await loadItems();
        render();

        if (localStorage.getItem('wishlist_admin_session') === 'true') {
            currentUser = { email: 'Admin', id: 'admin' };
            document.body.classList.add('is-authenticated');
            authBtn.style.display = 'none';
            userDisplay.style.display = 'flex';
            userEmailSpan.textContent = 'Admin Mode';
        }
    }

    init();
})();
