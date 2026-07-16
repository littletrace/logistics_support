export default async function handler(req, res) {
  const { query } = req.query;
  if (!query) {
    return res.status(400).json({ error: 'query parameter is required' });
  }

  const KAKAO_KEY = process.env.VITE_KAKAO_REST_KEY;
  if (!KAKAO_KEY) {
    return res.status(500).json({ error: 'Kakao API key not configured' });
  }

  try {
    const response = await fetch(
      `https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(query)}`,
      { headers: { Authorization: `KakaoAK ${KAKAO_KEY}` } }
    );
    const data = await response.json();
    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch from Kakao API' });
  }
}
