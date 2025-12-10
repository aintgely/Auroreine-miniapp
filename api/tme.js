// api/tme.js  (Vercel serverless)
// Node 14+, uses node-fetch v2 + cheerio
const fetch = require('node-fetch');
const cheerio = require('cheerio');

module.exports = async (req, res) => {
  try {
    const channel = (req.query.channel || req.query.CHANNEL || 'S15XINYU').replace(/[^a-zA-Z0-9_]/g,'');
    const max = Math.min(20, parseInt(req.query.max || '8', 10));
    const url = `https://t.me/s/${channel}`;

    const r = await fetch(url, { method: 'GET' });
    if (!r.ok) {
      res.setHeader('Access-Control-Allow-Origin','*');
      res.status(502).json({ ok:false, error: 't.me returned ' + r.status });
      return;
    }
    const html = await r.text();
    const $ = cheerio.load(html);

    const msgs = $('.tgme_widget_message, .tgme_widget_message_wrap, .tme_widget_message').toArray();
    const posts = [];

    for (let i = 0; i < msgs.length && posts.length < max; i++) {
      const el = msgs[i];
      const $el = $(el);

      const textNode = $el.find('.tgme_widget_message_text, .message_text, p').first();
      let excerpt = textNode.text().trim();

      const timeNode = $el.find('.tgme_widget_message_date, time').first();
      const timeStr = timeNode.text().trim() || '';

      let link = $el.find('a.tgme_widget_message_date').attr('href') || $el.find('a[href*="/' + channel + '/"]').attr('href') || null;
      if (link && link.indexOf('://') === -1) link = 'https://t.me' + link;

      let thumb = null;
      const photo = $el.find('.tgme_widget_message_photo').first();
      if (photo && photo.length) {
        const img = photo.find('img').first();
        if (img && img.attr) thumb = img.attr('src') || img.attr('data-src') || null;
        if (!thumb) {
          const bg = photo.attr('style') || '';
          const m = bg && bg.match(/url\(["']?(.*?)["']?\)/);
          if (m) thumb = m[1];
        }
      }
      if (!thumb) {
        const anyImg = $el.find('img').first();
        if (anyImg && anyImg.attr) thumb = anyImg.attr('src') || anyImg.attr('data-src') || null;
      }

      posts.push({
        excerpt: excerpt || '',
        thumb: thumb || null,
        link: link || `https://t.me/${channel}`,
        timeStr: timeStr || ''
      });
    }

    // fallback: search anchor links if none found
    if (posts.length === 0) {
      $('a').each((i, a) => {
        if (posts.length >= max) return false;
        const href = $(a).attr('href') || '';
        if (href.indexOf(`/${channel}/`) !== -1) {
          posts.push({
            excerpt: $(a).text().trim().slice(0,140),
            thumb: null,
            link: href.startsWith('http') ? href : 'https://t.me' + href,
            timeStr: ''
          });
        }
      });
    }

    res.setHeader('Access-Control-Allow-Origin','*');
    res.setHeader('Content-Type','application/json; charset=utf-8');
    res.status(200).send(JSON.stringify({ ok:true, channel, count: posts.length, posts }));
  } catch (err) {
    res.setHeader('Access-Control-Allow-Origin','*');
    res.status(500).json({ ok:false, error: err && err.message ? err.message : String(err) });
  }
};
