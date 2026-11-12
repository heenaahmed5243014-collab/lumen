// Generate offline Lumen license keys: node tools/genkey.js [count]
// Keep this script private; it must match keyChecksum() in src/app.js.
const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const part = () => Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
function keyChecksum(body) {
  let n = 0; for (let i = 0; i < body.length; i++) n = (n + body.charCodeAt(i) * (i + 7) * 31) % 1679616;
  return n.toString(36).toUpperCase().padStart(4, '0');
}
for (let i = 0; i < (+process.argv[2] || 1); i++) { const a = part(), b = part(); console.log(`LUMEN-${a}-${b}-${keyChecksum(a + b)}`); }
