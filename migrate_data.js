const Database = require('better-sqlite3');
const path = require('path');

const SUPABASE_URL = 'https://tzhmcojnjnjtdrhkpdph.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR6aG1jb2puam5qdGRyaGtwZHBoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE1MTIzMTYsImV4cCI6MjA4NzA4ODMxNn0.VhcR5YpvUglBbwqvw9FtM9l-s3H1IVFJZFAFMyZPshU';

const dbPath = path.join(__dirname, 'wishlist.db');
const db = new Database(dbPath);

async function migrate() {
    console.log('Fetching items from Supabase...');
    try {
        const response = await fetch(`${SUPABASE_URL}/rest/v1/wishlist?select=*`, {
            headers: {
                'apikey': SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
            }
        });

        if (!response.ok) {
            throw new Error(`Supabase fetch failed: ${response.statusText}`);
        }

        const items = await response.json();
        console.log(`Fetched ${items.length} items from Supabase.`);

        const insert = db.prepare(`
            INSERT OR IGNORE INTO wishlist (id, name, url, image, price, note, category, subcategory, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        const insertMany = db.transaction((items) => {
            for (const item of items) {
                insert.run(
                    item.id,
                    item.name,
                    item.url,
                    item.image,
                    item.price,
                    item.note,
                    item.category,
                    item.subcategory || null,
                    item.created_at || Date.now()
                );
            }
        });

        insertMany(items);
        console.log('Migration successful!');

    } catch (error) {
        console.error('Migration failed:', error);
    }
}

migrate();
