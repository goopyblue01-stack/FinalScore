import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import fetch from "node-fetch";
import { differenceInDays, parseISO, format } from "date-fns";
import _ from "lodash";
import dotenv from "dotenv";

dotenv.config();

const API_KEY = process.env.FOOTBALL_DATA_API_KEY;
const BASE_URL = "https://api.football-data.org/v4";

// Caching structure
interface CacheEntry {
  data: any;
  timestamp: number;
}

const leagueCache: Record<string, CacheEntry> = {};
const leagueAvgCache: Record<string, number> = {};
const CACHE_TTL = 60 * 60 * 1000; // 1 hour for historical data
const MATCHES_CACHE_TTL = 60 * 1000; // 1 minute for daily matches

const FREE_LEAGUES = ["PL", "PD", "SA", "BL1", "FL1", "CL", "EC", "ELC", "DED", "PPL", "BSA", "CLI"];
const GLOBAL_AVG_GOALS = 1.35;

const TRANSLATIONS: Record<string, string> = {
  // Competitions
  "Premier League": "프리미어리그",
  "Primera Division": "라리가",
  "Serie A": "세리에 A",
  "Bundesliga": "분데스리가",
  "Ligue 1": "리그 앙",
  "UEFA Champions League": "챔피언스리그",
  "European Championship": "유로",
  "Championship": "챔피언십",
  "Eredivisie": "에레디비시",
  "Primeira Liga": "프리메이라리가",
  "Campeonato Brasileiro Série A": "브라질 세리에 A",
  "Copa Libertadores": "코파 리베르타도레스",

  // Major Teams (EPL)
  "Arsenal FC": "아스널",
  "Aston Villa FC": "애스턴 빌라",
  "Bournemouth AFC": "본머스",
  "Brentford FC": "브렌트포드",
  "Brighton & Hove Albion FC": "브라이튼",
  "Chelsea FC": "첼시",
  "Crystal Palace FC": "크리스탈 팰리스",
  "Everton FC": "에버튼",
  "Fulham FC": "풀럼",
  "Liverpool FC": "리버풀",
  "Luton Town FC": "루턴 타운",
  "Manchester City FC": "맨시티",
  "Manchester United FC": "맨유",
  "Newcastle United FC": "뉴캐슬",
  "Nottingham Forest FC": "노팅엄",
  "Sheffield United FC": "셰필드",
  "Tottenham Hotspur FC": "토트넘",
  "West Ham United FC": "웨스트햄",
  "Wolverhampton Wanderers FC": "울버햄튼",

  // Major Teams (La Liga)
  "Athletic Club": "빌바오",
  "Atlético Madrid": "AT 마드리드",
  "FC Barcelona": "바르셀로나",
  "Real Madrid CF": "레알 마드리드",
  "Real Sociedad de Fútbol": "레알 소시에다드",
  "Sevilla FC": "세비야",
  "Villarreal CF": "비야레알",
  "Valencia CF": "발렌시아",
  "Girona FC": "지로나",

  // Major Teams (Serie A)
  "AC Milan": "AC 밀란",
  "AS Roma": "AS 로마",
  "Atalanta BC": "아탈란타",
  "Inter Milan": "인터 밀란",
  "Juventus FC": "유벤투스",
  "SS Lazio": "라치오",
  "SSC Napoli": "나폴리",
  "ACF Fiorentina": "피오렌티나",

  // Major Teams (Bundesliga)
  "FC Bayern München": "바이에른 뮌헨",
  "Borussia Dortmund": "도르트문트",
  "RB Leipzig": "라이프치히",
  "Bayer 04 Leverkusen": "레버쿠젠",
  "Eintracht Frankfurt": "프랑크푸르트",

  // Major Teams (Ligue 1)
  "Paris Saint-Germain FC": "PSG",
  "Olympique de Marseille": "마르세유",
  "Olympique Lyonnais": "리옹",
  "AS Monaco FC": "모나코",
  "Lille OSC": "릴",
};

function translate(name: string): string {
  return TRANSLATIONS[name] || name;
}

// Poisson Distribution
function poisson(k: number, lambda: number): number {
  if (lambda <= 0) return k === 0 ? 1 : 0;
  return (Math.pow(lambda, k) * Math.exp(-lambda)) / factorial(k);
}

function factorial(n: number): number {
  if (n === 0) return 1;
  let res = 1;
  for (let i = 2; i <= n; i++) res *= i;
  return res;
}

async function fetchWithRetry(url: string, options: any, retries = 3): Promise<any> {
  for (let i = 0; i < retries; i++) {
    const response = await fetch(url, options);
    if (response.status === 429) {
      const retryAfter = response.headers.get("Retry-After");
      const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : 2000;
      await new Promise((resolve) => setTimeout(resolve, waitTime));
      continue;
    }
    return response.json();
  }
  throw new Error("Rate limit exceeded after retries");
}

async function getLeagueMatches(leagueCode: string) {
  const now = Date.now();
  if (leagueCache[leagueCode] && now - leagueCache[leagueCode].timestamp < CACHE_TTL) {
    return leagueCache[leagueCode].data;
  }

  try {
    const data = await fetchWithRetry(`${BASE_URL}/competitions/${leagueCode}/matches`, {
      headers: { "X-Auth-Token": API_KEY || "" },
    });
    if (data.matches) {
      // Sort matches by date to ensure slice(-10) works correctly later
      const sortedMatches = _.sortBy(data.matches, m => m.utcDate);
      leagueCache[leagueCode] = { data: sortedMatches, timestamp: now };
      
      // Calculate league average goals per team
      const finishedMatches = sortedMatches.filter(m => m.status === "FINISHED").slice(-50);
      if (finishedMatches.length > 0) {
        const totalGoals = finishedMatches.reduce((sum, m) => sum + (m.score.fullTime.home || 0) + (m.score.fullTime.away || 0), 0);
        leagueAvgCache[leagueCode] = totalGoals / (finishedMatches.length * 2);
      } else {
        leagueAvgCache[leagueCode] = GLOBAL_AVG_GOALS;
      }

      return sortedMatches;
    }
  } catch (e) {
    console.error(`Error fetching ${leagueCode}:`, e);
    return leagueCache[leagueCode]?.data || [];
  }
  return [];
}

function calculateTeamStrength(teamId: number, allMatches: any[], targetDate: Date, leagueCode: string) {
  const recentMatches = allMatches.filter(m => 
    (m.homeTeam.id === teamId || m.awayTeam.id === teamId) && 
    m.status === "FINISHED" &&
    parseISO(m.utcDate) < targetDate
  ).slice(-10); // Last 10 matches

  if (recentMatches.length === 0) return { attackFactor: 1.0, defenseFactor: 1.0 };

  let totalWeightedScored = 0;
  let totalWeightedConceded = 0;
  let totalWeight = 0;

  recentMatches.forEach(m => {
    const daysDiff = differenceInDays(targetDate, parseISO(m.utcDate));
    const weight = Math.exp(-daysDiff / 30);
    const isHome = m.homeTeam.id === teamId;
    
    const scored = (isHome ? m.score.fullTime.home : m.score.fullTime.away) || 0;
    const conceded = (isHome ? m.score.fullTime.away : m.score.fullTime.home) || 0;

    totalWeightedScored += scored * weight;
    totalWeightedConceded += conceded * weight;
    totalWeight += weight;
  });

  const avgScored = totalWeightedScored / totalWeight;
  const avgConceded = totalWeightedConceded / totalWeight;
  
  const leagueAvg = leagueAvgCache[leagueCode] || GLOBAL_AVG_GOALS;

  return {
    attackFactor: avgScored / leagueAvg,
    defenseFactor: avgConceded / leagueAvg
  };
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.get("/api/matches", async (req, res) => {
    const dateStr = req.query.date as string || format(new Date(), "yyyy-MM-dd");
    const targetDate = parseISO(dateStr);

    try {
      const allLeagueData = await Promise.all(FREE_LEAGUES.map(code => getLeagueMatches(code)));
      const allMatches = _.flatten(allLeagueData);
      
      const dayMatches = allMatches.filter(m => format(parseISO(m.utcDate), "yyyy-MM-dd") === dateStr);

      const results = dayMatches.map(m => {
        const homeStrength = calculateTeamStrength(m.homeTeam.id, allMatches, targetDate, m.competition.code);
        const awayStrength = calculateTeamStrength(m.awayTeam.id, allMatches, targetDate, m.competition.code);

        // Use league-specific average or global average
        const leagueAvg = leagueAvgCache[m.competition.code] || GLOBAL_AVG_GOALS;

        // Expected goals (xG)
        // Formula: Team_Attack_Factor * Opponent_Defense_Factor * League_Avg
        const homeEx = homeStrength.attackFactor * awayStrength.defenseFactor * leagueAvg * 1.1; // Home advantage
        const awayEx = awayStrength.attackFactor * homeStrength.defenseFactor * leagueAvg * 0.9;

        // Poisson for Win/Draw/Loss
        let pHome = 0, pDraw = 0, pAway = 0;
        const scoreProbs: { score: string, p: number }[] = [];

        for (let h = 0; h <= 6; h++) {
          for (let a = 0; a <= 6; a++) {
            const prob = poisson(h, homeEx) * poisson(a, awayEx);
            if (h > a) pHome += prob;
            else if (h === a) pDraw += prob;
            else pAway += prob;

            scoreProbs.push({ score: `${h}:${a}`, p: prob });
          }
        }

        // Normalize to 100%
        const totalP = pHome + pDraw + pAway;
        const normHome = Math.round((pHome / totalP) * 100);
        const normAway = Math.round((pAway / totalP) * 100);
        const normDraw = 100 - normHome - normAway;

        const topPredictions = _.orderBy(scoreProbs, ["p"], ["desc"]).slice(0, 3);
        
        // Use rounded xG for more intuitive "Predicted Score" that matches the win bar
        const predictedHome = Math.round(homeEx);
        const predictedAway = Math.round(awayEx);

        return {
          id: m.id.toString(),
          competition: translate(m.competition.name),
          date: m.utcDate,
          homeTeam: translate(m.homeTeam.name),
          awayTeam: translate(m.awayTeam.name),
          status: m.status,
          currentScore: m.score.fullTime,
          prediction: topPredictions.map(tp => ({ score: tp.score, p: Math.round((tp.p / totalP) * 100) / 100 })),
          prob: {
            home: normHome,
            draw: normDraw,
            away: normAway
          },
          predictedScore: {
            home: predictedHome,
            away: predictedAway
          }
        };
      });

      res.json(results);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to fetch data" });
    }
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
