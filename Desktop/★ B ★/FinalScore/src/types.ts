export interface Prediction {
  score: string;
  p: number;
}

export interface WinProb {
  home: number;
  draw: number;
  away: number;
}

export interface Match {
  id: string;
  competition: string;
  date: string;
  homeTeam: string;
  awayTeam: string;
  status: 'SCHEDULED' | 'LIVE' | 'FINISHED' | 'IN_PLAY' | 'PAUSED';
  currentScore?: {
    home: number;
    away: number;
  };
  minute?: number;
  prediction?: Prediction[];
  prob?: WinProb;
  predictedScore?: {
    home: number;
    away: number;
  };
}
