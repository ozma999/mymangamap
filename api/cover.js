// 표지 이미지를 우리 서버를 거쳐 같은 출처로 전달합니다.
// 브라우저가 CORS 없이 캐시해둔 응답 때문에 PNG 저장 시 표지를 못 넣는 문제의 최종 대비책입니다.
// 아무 주소나 대신 받아주면 공개 프록시가 되므로 AniList 도메인만 허용합니다.

const ALLOW = [/^https:\/\/[a-z0-9.-]*anilist\.co\//i];

module.exports = async function handler(req, res) {
  const u = (req.query && req.query.u) || '';
  if (!u || !ALLOW.some((re) => re.test(u))) {
    return res.status(400).json({ error: '허용되지 않은 주소입니다' });
  }
  try {
    const r = await fetch(u);
    if (!r.ok) return res.status(502).json({ error: 'upstream ' + r.status });
    const ct = r.headers.get('content-type') || 'image/jpeg';
    if (!/^image\//i.test(ct)) return res.status(415).json({ error: '이미지가 아닙니다' });
    const buf = Buffer.from(await r.arrayBuffer());
    res.setHeader('Content-Type', ct);
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=604800');
    return res.status(200).send(buf);
  } catch (e) {
    return res.status(502).json({ error: String((e && e.message) || e) });
  }
};
