const fetch = require("node-fetch");

module.exports = async (req, res) => {
  const channel = (req.query.channel || "S15XINYU").replace(/[^a-zA-Z0-9_]/g,'');
  const url = `https://t.me/s/${channel}`;

  try {
    const r = await fetch(url, { method: "GET", redirect: "follow" });
    const text = await r.text();

    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Access-Control-Allow-Origin", "*");

    // send first 20k chars so we can see structure
    res.status(200).send(text.slice(0, 20000));

  } catch (err) {
    res.status(500).send("Error: " + err.message);
  }
};
