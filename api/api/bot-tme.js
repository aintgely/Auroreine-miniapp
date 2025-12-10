// api/bot-tme.js
// Simple: calls Telegram getUpdates and returns channel_post messages as JSON.
// For production consider using setWebhook and storing seen update_id.
const fetch = require('node-fetch');

const TOKEN = process.env.TG_BOT_TOKEN || 'PUT_YOUR_TOKEN_HERE';

function tgFileUrl(filePath) {
  if (!filePath) return null;
  return `https://api.telegram.org/file/bot${TOKEN}/${filePath}`;
}

module.exports = async (req, res) => {
  try {
    if (!TOKEN || TOKEN === 'PUT_YOUR_TOKEN_HERE') {
      res.setHeader('Access-Control-Allow-Origin','*');
      res.status(400).json({ ok:false, error: 'Bot token not set. Set TG_BOT_TOKEN env var in Vercel.' });
      return;
    }

    const r = await fetch(`https://api.telegram.org/bot${TOKEN}/getUpdates`, { method: 'GET' });
    const json = await r.json();

    if (!json.ok) {
      res.setHeader('Access-Control-Allow-Origin','*');
      res.status(500).json({ ok:false, error: json });
      return;
    }

    const posts = [];
    for (const u of json.result || []) {
      if (u.channel_post) {
        const cp = u.channel_post;
        const item = {
          message_id: cp.message_id,
          date: cp.date,
          text: cp.caption || cp.text || '',
          link: cp.message_id && cp.chat && cp.chat.username ? `https://t.me/${cp.chat.username}/${cp.message_id}` : null,
          thumbs: []
        };

        // photos array -> get highest resolution
        if (cp.photo && cp.photo.length) {
          const largest = cp.photo[cp.photo.length - 1];
          const gf = await fetch(`https://api.telegram.org/bot${TOKEN}/getFile?file_id=${largest.file_id}`);
          const gfj = await gf.json();
          if (gfj.ok && gfj.result && gfj.result.file_path) {
            item.thumbs.push(tgFileUrl(gfj.result.file_path));
          }
        }

        // document (may be an image)
        if (cp.document && cp.document.file_id) {
          const gf = await fetch(`https://api.telegram.org/bot${TOKEN}/getFile?file_id=${cp.document.file_id}`);
          const gfj = await gf.json();
          if (gfj.ok && gfj.result && gfj.result.file_path) {
            item.thumbs.push(tgFileUrl(gfj.result.file_path));
          }
        }

        posts.push(item);
      }
    }

    // newest-first
    posts.sort((a,b)=> (b.date||0) - (a.date||0));

    res.setHeader('Access-Control-Allow-Origin','*');
    res.json({ ok:true, count: posts.length, posts });
  } catch (err) {
    res.setHeader('Access-Control-Allow-Origin','*');
    res.status(500).json({ ok:false, error: err.message });
  }
};
