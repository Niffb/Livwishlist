// ============================================
//  WISHLIST — App Logic
// ============================================

(function () {
    'use strict';

    // --- Constants ---
    const STORAGE_KEY = 'wishlist_items';
    const MICROLINK_API = 'https://api.microlink.io';
    const CATEGORIES = ['clothes', 'stationery', 'home', 'books', 'misc'];
    const CATEGORY_LABELS = {
        clothes: 'Clothes',
        stationery: 'Stationery',
        home: 'Home',
        books: 'Books',
        misc: 'Miscellaneous',
    };

    // ==========================================
    //  SUPABASE CONFIGURATION
    // ==========================================
    // IMPORTANT: Replace these with your actual Supabase URL and Anon Key
    const SUPABASE_URL = 'YOUR_SUPABASE_URL';
    const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';
    const ADMIN_PASSWORD = 'liv123'; // Change this to your preferred password

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
    let lastDeleted = null;
    let toastTimeout = null;
    let currentUser = null;

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
            .order('createdAt', { ascending: false });

        if (error) {
            console.error('Error loading items:', error);
            return [];
        }
        return data;
    }

    async function saveItem(item) {
        if (!supabase) {
            items.unshift(item);
            localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
            return;
        }

        const { error } = await supabase
            .from('wishlist')
            .insert([item]);

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
    function cleanTitle(title) {
        if (!title) return '';
        // Strip query params and hash
        let cleaned = title.split('?')[0].split('#')[0].trim();

        // If it's a long hyphenated string (slug) or contains path segments
        if (cleaned.includes('/') || (cleaned.includes('-') && !cleaned.includes(' '))) {
            const segments = cleaned.split('/');
            cleaned = segments[segments.length - 1] || segments[segments.length - 2] || cleaned;

            cleaned = cleaned
                .split('-')
                .filter((part) => {
                    // Remove purely numeric parts (IDs) and very short segments
                    return !/^\d+$/.test(part) && part.length > 2;
                })
                .join(' ');
        }

        // Capitalize words
        if (cleaned) {
            cleaned = cleaned
                .toLowerCase()
                .split(' ')
                .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
                .join(' ');
        }
        return cleaned;
    }

    // ==========================================
    //  SMART FETCH — Microlink API
    // ==========================================

    fetchBtn.addEventListener('click', async () => {
        let url = document.getElementById('itemUrl').value.trim();
        if (!url) {
            document.getElementById('itemUrl').focus();
            return;
        }

        // Quick cleanup: strip tracking params that might bloat the request
        try {
            const u = new URL(url);
            // Keep essential product ID params if they exist, but generally clean
            // url = u.origin + u.pathname; 
            // Actually, keep it for now as some sites need params for product variants.
        } catch (e) { }

        // Start loading
        fetchBtn.classList.add('loading');
        fetchBtn.disabled = true;
        fetchPreview.classList.remove('show');

        try {
            const response = await fetch(
                `${MICROLINK_API}?url=${encodeURIComponent(url)}&palette=true`
            );
            const json = await response.json();

            if (json.status === 'success' && json.data) {
                const data = json.data;

                // Auto-fill form fields
                const nameInput = document.getElementById('itemName');
                const imageInput = document.getElementById('itemImage');
                const priceInput = document.getElementById('itemPrice');

                // Clean and Set Name
                const cleanedTitle = cleanTitle(data.title);
                if (cleanedTitle && cleanedTitle.length > 3) {
                    nameInput.value = cleanedTitle;
                } else if (data.description) {
                    const descTitle = cleanTitle(data.description.split('.')[0]);
                    if (descTitle && descTitle.length < 80) nameInput.value = descTitle;
                }

                // Set Image - Ignore favicons
                let bestImage = '';
                if (data.image && data.image.url && !data.image.url.toLowerCase().includes('favicon')) {
                    bestImage = data.image.url;
                } else if (data.logo && data.logo.url && !data.logo.url.toLowerCase().includes('favicon')) {
                    bestImage = data.logo.url;
                }

                if (bestImage) {
                    imageInput.value = bestImage;
                }

                // Set Price - More aggressive detection
                let detectedPrice = '';
                if (data.price) {
                    detectedPrice = data.price;
                } else {
                    // Combine all text data to search for currency patterns
                    const searchStr = [
                        data.description || '',
                        data.title || '',
                        data.publisher || '',
                        typeof data.text === 'string' ? data.text : ''
                    ].join(' | ');

                    // Specific regex for currency symbols that prioritizes the symbol
                    const currencyRegex = /(?:£|€|\$|USD|GBP|EUR)\s?[\d,.]+(?:\.\d{2})?|[\d,.]+(?:\.\d{2})?\s?(?:£|€|\$|USD|GBP|EUR)/i;
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
                fetchPreviewTitle.textContent = 'Fetch returned no data';
                fetchPreviewDesc.textContent = 'The site might be blocking scraping. Please fill in manually.';
                fetchPreviewImg.style.display = 'none';
                fetchPreview.classList.add('show');
            }
        } catch (err) {
            fetchPreviewTitle.textContent = 'Fetch failed';
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

    function render() {
        const filtered =
            activeCategory === 'all'
                ? items
                : items.filter((item) => item.category === activeCategory);

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

            filtered.forEach((item, i) => {
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
                    ? `<img class="wish-card-image" src="${escapeHtml(item.image)}" alt="${escapeHtml(item.name)}" onerror="this.style.display='none'">`
                    : '';

                card.innerHTML = `
          ${imageHtml}
          <div class="wish-card-body">
            <div class="wish-card-content">
              <div class="wish-card-name">
                ${escapeHtml(item.name)}
                <span class="wish-card-category">${CATEGORY_LABELS[item.category] || item.category}</span>
              </div>
              ${noteHtml}
              ${priceHtml}
              <a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer" class="wish-card-url" onclick="event.stopPropagation()">
                ${displayUrl(item.url)}
              </a>
            </div>
            <div class="wish-card-actions">
              <button class="btn-delete" data-id="${item.id}" aria-label="Delete item">&times;</button>
            </div>
          </div>
        `;

                // Click card to open URL
                card.addEventListener('click', (e) => {
                    if (
                        e.target.closest('.btn-delete') ||
                        e.target.closest('.wish-card-url')
                    )
                        return;
                    window.open(item.url, '_blank', 'noopener,noreferrer');
                });

                grid.appendChild(card);
            });
        }
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
        setTimeout(() => authEmailInput.focus(), 350);
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

        if (!name || !url) return;

        const newItem = {
            id: uid(),
            name,
            url,
            note,
            category,
            price,
            image,
            createdAt: Date.now(),
        };

        await saveItem(newItem);
        if (!supabase) {
            render();
        }
        closeModal();
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
