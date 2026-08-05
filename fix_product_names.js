const SUPABASE_URL = 'https://tzhmcojnjnjtdrhkpdph.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR6aG1jb2puam5qdGRyaGtwZHBoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE1MTIzMTYsImV4cCI6MjA4NzA4ODMxNn0.VhcR5YpvUglBbwqvw9FtM9l-s3H1IVFJZFAFMyZPshU';

function getHeaders() {
  return {
    'apikey': SUPABASE_ANON_KEY,
    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json'
  };
}

async function fixSpecificTitles() {
  const fixes = [
    { id: 'mltm62v48mizs', name: 'Pull & Bear Ruffled Check Skort in Grey' },
    { id: 'mq2oiy2a27rlz', name: 'Bluesow Feather & Thistles Embroidered Velour Slip Maxi Dress' },
    { id: 'ms3j06b9oxbs0', name: 'Sunmi Mini Dress Cupro Deep Purple' },
    { id: 'mq3yyj3o0wxop', name: 'Trudis Wrap Top Jersey Dusty Mauve' }
  ];

  for (const fix of fixes) {
    await fetch(`${SUPABASE_URL}/rest/v1/wishlist?id=eq.${fix.id}`, {
      method: 'PATCH',
      headers: getHeaders(),
      body: JSON.stringify({ name: fix.name })
    });
    console.log(`✓ Restored: ${fix.name}`);
  }
}

fixSpecificTitles();
