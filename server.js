const express = require('express');
const cors = require('cors');
const Database = require('better-sqlite3');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// Database setup
const dbPath = path.join(__dirname, 'wishlist.db');
const db = new Database(dbPath);

// Initialize table
db.exec(`
  CREATE TABLE IF NOT EXISTS wishlist (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    image TEXT,
    price TEXT,
    note TEXT,
    category TEXT NOT NULL,
    subcategory TEXT,
    created_at INTEGER NOT NULL
  )
`);

// API Endpoints

// GET all items
app.get('/api/items', (req, res) => {
  try {
    const items = db.prepare('SELECT * FROM wishlist ORDER BY created_at DESC').all();
    res.json(items);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST a new item
app.post('/api/items', (req, res) => {
  const { id, name, url, image, price, note, category, subcategory, created_at } = req.body;
  
  if (!name || !url || !category) {
    return res.status(400).json({ error: 'Name, URL, and Category are required' });
  }

  try {
    const info = db.prepare(`
      INSERT INTO wishlist (id, name, url, image, price, note, category, subcategory, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, name, url, image, price, note, category, subcategory, created_at || Date.now());
    
    res.status(201).json({ id, message: 'Item added successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PATCH an item
app.patch('/api/items/:id', (req, res) => {
  const { id } = req.params;
  const updates = req.body;
  
  const fields = Object.keys(updates);
  if (fields.length === 0) {
    return res.status(400).json({ error: 'No updates provided' });
  }

  const setClause = fields.map(field => `${field} = ?`).join(', ');
  const values = Object.values(updates);

  try {
    const info = db.prepare(`UPDATE wishlist SET ${setClause} WHERE id = ?`).run(...values, id);
    if (info.changes === 0) {
      return res.status(404).json({ error: 'Item not found' });
    }
    res.json({ message: 'Item updated successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE an item
app.delete('/api/items/:id', (req, res) => {
  const { id } = req.params;
  try {
    const info = db.prepare('DELETE FROM wishlist WHERE id = ?').run(id);
    if (info.changes === 0) {
      return res.status(404).json({ error: 'Item not found' });
    }
    res.json({ message: 'Item deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Start server
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
