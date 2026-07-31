// 취향 유전자 지도 — 클럽 공용 저장소
// Upstash Redis REST API 를 직접 호출합니다. 외부 패키지가 없으니 빌드도 package.json 도 필요 없습니다.
//
// 필요한 환경변수 (Vercel 마켓플레이스에서 Upstash Redis 를 붙이면 자동으로 주입됩니다)
//   KV_REST_API_URL / KV_REST_API_TOKEN            ← Vercel 통합이 넣어주는 이름
//   또는 UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN  ← Upstash 직접 연결 시 이름
//   ADMIN_KEY (선택) — 전체 비우기에 필요. 설정하지 않으면 비우기가 막힙니다.

const URL_ =
  process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '';
const TOKEN =
  process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '';

const K_MEMBERS = 'dna6:members';
const K_COVERS  = 'dna6:covers';
const K_CLUB    = 'dna6:club';

async function pipe(cmds) {
  const r = await fetch(URL_ + '/pipeline', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmds),
  });
  if (!r.ok) throw new Error('redis ' + r.status + ' ' + (await r.text()).slice(0, 200));
  return r.json();
}

// HGETALL 은 [필드, 값, 필드, 값 ...] 평면 배열로 옵니다.
function pairsToObj(flat) {
  const o = {};
  if (!Array.isArray(flat)) return o;
  for (let i = 0; i < flat.length; i += 2) o[flat[i]] = flat[i + 1];
  return o;
}

// CommonJS 로 씁니다. package.json 이나 vercel.json 없이 그대로 동작합니다.
module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (!URL_ || !TOKEN) {
    return res.status(500).json({
      error: '저장소 환경변수가 없습니다. Vercel 프로젝트에 Upstash Redis 를 연결하고 재배포하세요.',
    });
  }

  try {
    if (req.method === 'GET') {
      const out = await pipe([
        ['HGETALL', K_MEMBERS],
        ['HGETALL', K_COVERS],
        ['GET', K_CLUB],
      ]);
      const mObj = pairsToObj(out[0] && out[0].result);
      const members = Object.values(mObj)
        .map((v) => { try { return JSON.parse(v); } catch(e) { return null; } })
        .filter(Boolean);
      const covers = pairsToObj(out[1] && out[1].result);
      let club = null;
      try { club = out[2] && out[2].result ? JSON.parse(out[2].result) : null; } catch(e) {}
      return res.status(200).json({ ok: true, members, covers, club });
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});

      if (body.type === 'member') {
        const rec = body.rec;
        if (!rec || !rec.id || !Array.isArray(rec.works)) {
          return res.status(400).json({ error: '카드 형식이 올바르지 않습니다' });
        }
        // 멤버마다 해시 필드가 따로라 동시 제출이 서로를 덮어쓰지 않습니다.
        await pipe([['HSET', K_MEMBERS, String(rec.id), JSON.stringify(rec)]]);
        return res.status(200).json({ ok: true });
      }

      if (body.type === 'covers') {
        const map = body.map || {};
        const flat = [];
        for (const [k, v] of Object.entries(map)) {
          if (typeof v === 'string' && v.length < 600) flat.push(String(k), v);
        }
        if (flat.length) await pipe([['HSET', K_COVERS, ...flat]]);
        return res.status(200).json({ ok: true, saved: flat.length / 2 });
      }

      if (body.type === 'club') {
        await pipe([['SET', K_CLUB, JSON.stringify(body.club || null)]]);
        return res.status(200).json({ ok: true });
      }

      if (body.type === 'wipe') {
        if (!process.env.ADMIN_KEY) {
          return res.status(403).json({ error: 'ADMIN_KEY 환경변수가 설정되지 않아 비우기가 막혀 있습니다' });
        }
        if (body.key !== process.env.ADMIN_KEY) {
          return res.status(403).json({ error: '운영자 키가 다릅니다' });
        }
        await pipe([['DEL', K_MEMBERS], ['DEL', K_COVERS], ['DEL', K_CLUB]]);
        return res.status(200).json({ ok: true });
      }

      return res.status(400).json({ error: '알 수 없는 요청 종류입니다' });
    }

    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'GET 또는 POST 만 받습니다' });
  } catch (e) {
    return res.status(500).json({ error: String((e && e.message) || e) });
  }
};
