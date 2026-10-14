// 구글시트 Apps Script 프록시: 브라우저 → /api/sheet(같은 도메인) → Apps Script
// 브라우저가 script.google.com을 직접 부르면 CORS로 막히는 경우가 있어 서버에서 대신 호출한다.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'POST only' });
  const url = process.env.VITE_SHEET_WEBAPP_URL;
  if (!url) return res.status(500).json({ ok: false, error: 'VITE_SHEET_WEBAPP_URL이 설정되지 않았습니다.' });
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: typeof req.body === 'string' ? req.body : JSON.stringify(req.body)
    });
    const text = await r.text();
    try {
      res.status(200).json(JSON.parse(text));
    } catch {
      // 로그인 페이지/오류 페이지 등 JSON이 아닌 응답 → 원인 파악용으로 앞부분 전달
      res.status(502).json({ ok: false, error: `Apps Script 응답 오류(${r.status}): ${text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').slice(0, 200)}` });
    }
  } catch (e) {
    res.status(502).json({ ok: false, error: String(e) });
  }
}
