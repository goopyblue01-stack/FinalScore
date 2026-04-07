import { useEffect, useState } from 'react';
import { RefreshCw, AlertCircle, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Match } from './types';
import { format, addDays, startOfToday } from 'date-fns';
import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export default function App() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [translating, setTranslating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedDateIdx, setSelectedDateIdx] = useState<number>(2); // Default to today

  const today = startOfToday();
  const dates = Array.from({ length: 5 }, (_, i) => {
    const date = addDays(today, i - 2);
    return {
      date,
      dateStr: format(date, 'yyyy-MM-dd'),
      day: format(date, 'M월 d일'),
      label: i === 2 ? '(today)' : ''
    };
  });

  const translateMatches = async (rawMatches: Match[]) => {
    if (rawMatches.length === 0) return rawMatches;
    
    setTranslating(true);
    try {
      const namesToTranslate = new Set<string>();
      rawMatches.forEach(m => {
        namesToTranslate.add(m.competition);
        namesToTranslate.add(m.homeTeam);
        namesToTranslate.add(m.awayTeam);
      });

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Translate the following football team and competition names into natural Korean. 
        Return ONLY a JSON object where the keys are the original names and the values are the Korean translations.
        Names: ${Array.from(namesToTranslate).join(', ')}`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: Array.from(namesToTranslate).reduce((acc, name) => {
              acc[name] = { type: Type.STRING };
              return acc;
            }, {} as any)
          }
        }
      });

      const translations = JSON.parse(response.text || '{}');
      
      return rawMatches.map(m => ({
        ...m,
        competition: translations[m.competition] || m.competition,
        homeTeam: translations[m.homeTeam] || m.homeTeam,
        awayTeam: translations[m.awayTeam] || m.awayTeam
      }));
    } catch (err) {
      console.error('Translation error:', err);
      return rawMatches;
    } finally {
      setTranslating(false);
    }
  };

  const fetchData = async (dateStr: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/matches?date=${dateStr}`);
      if (!response.ok) throw new Error('데이터를 불러오는데 실패했습니다.');
      const data = await response.json();
      
      // AI Translation
      const translatedData = await translateMatches(data);
      setMatches(translatedData);
    } catch (err) {
      setError(err instanceof Error ? err.message : '알 수 없는 에러가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData(dates[selectedDateIdx].dateStr);
  }, [selectedDateIdx]);

  return (
    <div className="min-h-screen bg-[#f8f9fa] text-slate-900 font-sans pb-10">
      {/* App Logo Header */}
      <header className="bg-white py-8 flex flex-col items-center justify-center border-b border-slate-200 shadow-sm">
        <div className="flex items-center gap-4">
          {/* FS Icon - Metallic Gold */}
          <div className="relative group">
            <div className="absolute -inset-1 bg-gradient-to-r from-[#bf953f] via-[#fcf6ba] to-[#b38728] rounded-xl blur opacity-20 group-hover:opacity-40 transition duration-1000"></div>
            <div className="relative bg-white w-14 h-14 rounded-xl flex items-center justify-center border border-[#bf953f]/40 shadow-xl">
              <span className="text-transparent bg-clip-text bg-gradient-to-b from-[#bf953f] via-[#d4af37] to-[#8a6d3b] text-3xl font-black italic tracking-tighter transform -skew-x-6">
                FS
              </span>
            </div>
          </div>

          {/* FinalScore Text - Metallic Gold Gradient */}
          <div className="flex flex-col">
            <h1 className="text-4xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-b from-[#bf953f] via-[#d4af37] to-[#8a6d3b] drop-shadow-sm">
              FinalScore
            </h1>
            <div className="h-0.5 w-full bg-gradient-to-r from-transparent via-[#bf953f]/40 to-transparent mt-1"></div>
          </div>
        </div>
      </header>

      {/* Date Selector */}
      <div className="bg-white border-b border-slate-200 pt-3 pb-3 px-2 sticky top-0 z-20 shadow-sm">
        <div className="max-w-4xl mx-auto flex justify-between gap-1.5 sm:gap-3">
          {dates.map((date, idx) => (
            <button
              key={idx}
              onClick={() => setSelectedDateIdx(idx)}
              className={`flex-1 min-w-0 h-12 sm:h-16 rounded-xl flex flex-col items-center justify-center transition-all ${
                selectedDateIdx === idx
                  ? 'bg-[#00b050] text-white shadow-lg shadow-green-100'
                  : 'bg-[#f1f3f5] text-slate-600 hover:bg-slate-200'
              }`}
            >
              <span className="text-[11px] sm:text-sm font-bold leading-none truncate w-full px-1 text-center">
                {date.day}
              </span>
              {date.label && (
                <span className={`text-[8px] sm:text-[10px] font-medium mt-0.5 sm:mt-1 leading-none ${selectedDateIdx === idx ? 'text-white/90' : 'text-slate-400'}`}>
                  {date.label}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <main className="max-w-4xl mx-auto px-4 mt-4">
        <div className="flex items-center justify-between mb-4 px-1">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-medium text-slate-500">
              {dates[selectedDateIdx].day} 경기 일정 ({matches.length}경기)
            </h2>
            {translating && (
              <div className="flex items-center gap-1 text-[10px] font-bold text-[#00b050] bg-[#e8f8f0] px-2 py-0.5 rounded-full animate-pulse">
                <Sparkles className="w-2.5 h-2.5" />
                <span>AI 번역 중...</span>
              </div>
            )}
          </div>
          <button 
            onClick={() => fetchData(dates[selectedDateIdx].dateStr)}
            disabled={loading}
            className="p-1.5 hover:bg-slate-200 rounded-full transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 text-slate-400 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Error State */}
        {error && (
          <div className="bg-red-50 border border-red-100 rounded-2xl p-6 text-center">
            <AlertCircle className="w-8 h-8 text-red-400 mx-auto mb-2" />
            <p className="text-red-600 font-medium">{error}</p>
            <button 
              onClick={() => fetchData(dates[selectedDateIdx].dateStr)}
              className="mt-4 text-sm font-bold text-red-700 underline"
            >
              다시 시도하기
            </button>
          </div>
        )}

        {/* Match List */}
        <div className="space-y-2">
          <AnimatePresence mode="popLayout">
            {!loading && matches.map((match) => {
              const isLive = match.status === 'IN_PLAY' || match.status === 'LIVE';
              const isFinished = match.status === 'FINISHED';
              const prediction = match.predictedScore || { home: 0, away: 0 };
              const prob = match.prob || { home: 50, away: 50, draw: 0 };
              
              const matchTime = new Date(match.date);
              const timeStr = format(matchTime, 'HH:mm');
              
              return (
                <motion.div
                  key={match.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`rounded-2xl border shadow-sm overflow-hidden transition-colors ${
                    isLive 
                      ? 'bg-red-50 border-red-200 ring-1 ring-red-100' 
                      : 'bg-white border-slate-100'
                  }`}
                >
                  <div className="p-3">
                    {/* Header: League & Time */}
                    <div className="flex justify-between items-start mb-2">
                      <span className="px-2.5 py-1 bg-[#e8f8f0] text-[#00b050] text-[11px] font-bold rounded-lg">
                        {match.competition}
                      </span>
                      <span className="text-sm font-medium text-slate-500">{timeStr}</span>
                    </div>

                    {/* Teams & Live Info */}
                    <div className="flex flex-col items-center mb-2">
                      {isLive && (
                        <span className="text-[9px] font-bold text-red-500 mb-0.5 animate-pulse">
                          LIVE
                        </span>
                      )}
                      <div className="flex items-center justify-center gap-2 w-full">
                        {/* Home Team */}
                        <div className="flex-1 flex items-center justify-end gap-2 min-w-0">
                          <span className={`font-bold text-slate-800 truncate text-right ${
                            match.homeTeam.length > 10 ? 'text-sm' : 'text-base'
                          }`}>
                            {match.homeTeam}
                          </span>
                          {(isLive || isFinished) && (
                            <span className={`text-base font-black flex-shrink-0 ${
                              (match.currentScore?.home ?? 0) > (match.currentScore?.away ?? 0) 
                                ? 'text-[#ff0000]' 
                                : 'text-slate-500'
                            }`}>
                              {match.currentScore?.home}
                            </span>
                          )}
                        </div>
                        
                        <span className="text-[10px] font-medium text-slate-400 flex-shrink-0 px-1">vs</span>
                        
                        {/* Away Team */}
                        <div className="flex-1 flex items-center justify-start gap-2 min-w-0">
                          {(isLive || isFinished) && (
                            <span className={`text-base font-black flex-shrink-0 ${
                              (match.currentScore?.away ?? 0) > (match.currentScore?.home ?? 0) 
                                ? 'text-[#ff0000]' 
                                : 'text-slate-500'
                            }`}>
                              {match.currentScore?.away}
                            </span>
                          )}
                          <span className={`font-bold text-slate-800 truncate text-left ${
                            match.awayTeam.length > 10 ? 'text-sm' : 'text-base'
                          }`}>
                            {match.awayTeam}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Predicted Score */}
                    <div className="flex flex-col items-center mb-2">
                      <span className="text-[10px] font-bold text-slate-400 mb-1.5 tracking-tight">예상 스코어</span>
                      <div className="flex items-center gap-3">
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-xl font-black ${
                          prediction.home === prediction.away 
                            ? 'bg-slate-100 text-slate-900' 
                            : 'bg-[#fff0f0] text-[#ff0000]'
                        }`}>
                          {prediction.home}
                        </div>
                        <span className="text-slate-300 font-bold">:</span>
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-xl font-black ${
                          prediction.home === prediction.away 
                            ? 'bg-slate-100 text-slate-900' 
                            : 'bg-[#f0f5ff] text-[#1a66ff]'
                        }`}>
                          {prediction.away}
                        </div>
                      </div>
                    </div>

                    {/* Win Probability Bar */}
                    <div className="pt-2 border-t border-slate-50">
                      <div className="relative h-2.5 w-full bg-slate-100 rounded-full overflow-hidden flex">
                        <div 
                          className="h-full bg-[#ff0000] transition-all duration-1000"
                          style={{ width: `${prob.home}%` }}
                        />
                        <div 
                          className="h-full bg-slate-300 transition-all duration-1000"
                          style={{ width: `${prob.draw}%` }}
                        />
                        <div 
                          className="h-full bg-[#1a66ff] transition-all duration-1000"
                          style={{ width: `${prob.away}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>

          {/* Loading State */}
          {loading && (
            <div className="space-y-2">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-40 bg-white rounded-2xl border border-slate-100 animate-pulse" />
              ))}
            </div>
          )}

          {/* Empty State */}
          {!loading && !error && matches.length === 0 && (
            <div className="text-center py-20 bg-white rounded-2xl border border-slate-100">
              <p className="text-slate-400 font-medium">선택한 날짜에 예정된 경기가 없습니다.</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
