import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // 1. 날짜 정보 가져오기 (없으면 오늘 날짜)
  const { date } = req.query;
  const dateStr = typeof date === 'string' ? date : new Date().toISOString().split('t')[0];

  // 2. 사장님이 Vercel에 저장한 비밀번호 꺼내기
  const API_KEY = process.env.API_KEY || process.env.VITE_API_KEY;

  if (!API_KEY) {
    return res.status(500).json({ error: 'API Key가 설정되지 않았습니다.' });
  }

  try {
    // 3. 축구 데이터 서버에 데이터 요청하기
    const response = await fetch(
      `https://api.football-data.org/v4/matches?dateFrom=${dateStr}&dateTo=${dateStr}`,
      {
        headers: { 'X-Auth-Token': API_KEY },
      }
    );

    if (!response.ok) {
      throw new Error(`축구 API 응답 에러: ${response.status}`);
    }

    const data = await response.json();

    // 4. 우리 앱이 이해할 수 있는 깔끔한 형식으로 변환하기
    const formattedMatches = data.matches.map((m: any) => ({
      id: m.id,
      competition: m.competition.name,
      homeTeam: m.homeTeam.name,
      awayTeam: m.awayTeam.name,
      status: m.status,
      date: m.utcDate,
      currentScore: {
        home: m.score.fullTime.home,
        away: m.score.fullTime.away,
      },
      // 간단한 예상 스코어 로직 (나중에 사장님만의 노하우를 넣으셔도 돼요!)
      predictedScore: {
        home: Math.floor(Math.random() * 3),
        away: Math.floor(Math.random() * 3),
      },
      prob: { home: 40, draw: 30, away: 30 }
    }));

    // 5. 완성된 데이터를 앱으로 보내주기
    return res.status(200).json(formattedMatches);

  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}