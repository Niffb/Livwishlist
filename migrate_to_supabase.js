const Database = require('better-sqlite3');
const path = require('path');

const SUPABASE_URL = 'https://tzhmcojnjnjtdrhkpdph.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR6aG1jb2puam5qdGRyaGtwZHBoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE1MTIzMTYsImV4cCI6MjA4NzA4ODMxNn0.VhcR5YpvUglBbwqvw9FtM9l-s3H1IVFJZFAFMyZPshU';

const dbPath = path.join(__dirname, 'wishlist.db');
const db = new Database(dbPath);

async function migrate() {
    console.log('Fetching items from local SQLite...');
    try {
        const items = db.prepare('SELECT * FROM wishlist').all();
        console.log(`Found ${items.length} items to migrate.`);

        if (items.length === 0) {
            console.log('No items to migrate.');
            return;
        }

        // Supabase REST Bulk Insert expects an array
        const response = await fetch(`${SUPABASE_URL}/rest/v1/wishlist`, {
            method: 'POST',
            headers: {
                'apikey': SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
                'Content-Type': 'application/json',
                'Prefer': 'return=minimal' // don't return the inserted rows
            },
            body: JSON.stringify(items)
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Supabase insert failed: ${response.status} ${response.statusText} - ${errorText}`);
        }

        console.log('Successfully ported all items to Supabase!');

    } catch (error) {
        console.error('Migration failed:', error);
    }
}

migrate();
