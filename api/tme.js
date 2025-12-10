// api/tme.js (improved parser + proxy fallbacks)
// Requires: cheerio, node-fetch@2
const fetch = require('node-fetch');
const cheerio = require('cheerio');

function normalizeUrl(u) {
  if (!u) return null;
  if (u.startsWith('//')) return 'https:' + u;
  if (u.startsWith('/')) return 'https://t.me' + u;
  if (!/^https?:\/\//i.test(u)) return u;
  return u;
}

async function tryFetch(url) {
  try {
    const r = await fetch(url, { method: 'GET', redirect: 'follow', timeout: 15000 });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const text = await r.text();
    return text;
  } catch (err) {
    return null;
  }
}

function extractPostsFromDoc(doc, channel, max) {
  const $ = cheerio.load(doc);
  const nodes = $('.tgme_widget_message, .tgme_widget_message_wrap, .tme_widget_message, .message, .message_wrap').toArray();
  const posts = [];

  const pushIf = (obj) => {
    if (posts.length < max) posts.push(obj);
  };

  nodes.forEach(node => {
    if (posts.length >= max) return;
    const $n = $(node);
    let excerpt = ($n.find('.tgme_widget_message_text, .message_text, p').first().text() || '').trim();
    if (!excerpt) excerpt = ($n.text() || '').trim().slice(0, 300);
    let timeStr = ($n.find('.tgme_widget_message_date, time').first().text() || '').trim();

    let link = $n.find('a.tgme_widget_message_date').attr('href') ||
               $n.find('a[href*="/' + channel + '/"]').attr('href') ||
               null;
    if (link && link.indexOf('://') === -1) link = 'https://t.me' + link;

    let thumb = null;
    const imgs = $n.find('img').toArray();
    for (let img of imgs) {
      const src = (img.attribs && (img.attribs['data-src'] || img.attribs['src'] || img.attribs['data-original'])) || null;
      if (src) { thumb = normalizeUrl(src); break; }
      if (img.attribs && img.attribs.srcset) {
        const candidates = img.attribs.srcset.split(',').map(s=>s.trim().split(' ')[0]).filter(Boolean);
        if (candidates.length) { thumb = normalizeUrl(candidates[0]); break; }
      }
    }
    if (!thumb) {
      const photo = $n.find('.tgme_widget_message_photo, .message_photo, .photo').first();
      if (photo && photo.attr && photo.attr('style')) {
        const bg = photo.attr('style');
        const m = bg.match(/url\(["']?(.*?)["']?\)/);
        if (m) thumb = normalizeUrl(m[1]);
      }
    }
    if (!thumb) {
      const styled = $n.find('[style]').toArray();
      for (let s of styled) {
        const st = (s.attribs && s.attribs.style) || '';
        const m = st.match(/background-image:\s*url\(["']?(.*?)["']?\)/i);
        if (m) { thumb = normalizeUrl(m[1]); break; }
      }
    }
    if (!thumb) {
      const og = $('meta[property="og:image"]').attr('content') || $('meta[name="og:image"]').attr('content') || null;
      if (og) thumb = normalizeUrl(og);
    }

    pushIf({ excerpt: excerpt || '', thumb: thumb || null, link: link || `https://t.me/${channel}`, timeStr: timeStr || '' });
  });

  if (posts.length === 0) {
    $('a').each((i, a) => {
      if (posts.length >= max) return false;
      const href = ($(a).attr('href') || '');
      if (href.indexOf(`/${channel}/`) !== -1) {
        const text = ($(a).text() || '').trim();
        posts.push({ excerpt: text.slice(0,140), thumb: null, link: href.startsWith('http') ? href : 'https://t.me' + href, timeStr: '' });
      }
    });
  }

  return posts.slice(0, max);
}

module.exports = async (req, res) => {
  try {
    const channel = (req.query.channel || req.query.CHANNEL || 'S15XINYU').replace(/[^a-zA-Z0-9_]/g,'');
    const max = Math.min(20, parseInt(req.query.max || '8', 10));
    const candidates = [
      `https://t.me/s/${channel}`,
      `https://r.jina.ai/http://t.me/s/${channel}`,
      `https://t.me/${channel}`
    ];

    let finalPosts = [];
    let lastHtml = null;
    for (let url of candidates) {
      const html = await tryFetch(url);
      if (!html) continue;
      lastHtml = html;
      const posts = extractPostsFromDoc(html, channel, max);
      if (posts && posts.length > 0) { finalPosts = posts; break; }
    }

    res.setHeader('Access-Control-Allow-Origin','*');
    res.setHeader('Content-Type','application/json; charset=utf-8');
    if (finalPosts.length > 0) {
      res.status(200).send(JSON.stringify({ ok: true, channel, count: finalPosts.length, posts: finalPosts }));
    } else {
      const len = lastHtml ? lastHtml.length : 0;
      res.status(200).send(JSON.stringify({ ok:true, channel, count:0, posts:[], debug: { lastFetchedLength: len, tried: candidates } }));
    }
  } catch (err) {
    res.setHeader('Access-Control-Allow-Origin','*');
    res.status(500).json({ ok:false, error: err && err.message ? err.message : String(err) });
  }
};
