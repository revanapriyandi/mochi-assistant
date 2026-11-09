// Types shared by the server, the assistant and the browser code.

export type Units = 'celsius' | 'fahrenheit';
export type Lang = 'en' | 'id';
export type Style = 'concise' | 'friendly';
export type Mood = 'happy' | 'concerned' | 'confused' | 'neutral';

export interface Profile {
  city: string;
  units: Units;
  nickname: string;
  language: Lang;
  eventMinutes: number;
  style: Style;
  voice: string;
}

export interface DayForecast {
  date: string; // YYYY-MM-DD
  code: number;
  desc: string;
  descId: string;
  max: number;
  min: number;
  rain: number | null; // % chance
}

export interface Weather {
  place: string;
  temp: number;
  feels?: number;
  humidity?: number;
  wind?: number;
  code: number;
  day: boolean;
  unit: '°C' | '°F';
  desc: string;
  descId: string;
  forecast?: DayForecast[];
}

export interface CalEvent {
  id?: string;
  summary: string;
  start: string; // ISO date-time, or YYYY-MM-DD for all-day events
  end: string;
  link?: string;
}

export interface Slot { start: string; end: string }
export interface Recommendation { icon: string; text: string }

export interface Briefing {
  date: string;
  place?: string;
  unit?: Weather['unit'];
  forecast: DayForecast | null;
  events: CalEvent[];
  slots: Slot[];
  calendar: boolean; // false when Google Calendar is not connected
  recommendations: Recommendation[];
}

export interface ToolResults {
  get_profile: Profile;
  update_profile: Profile;
  get_weather: Weather | { error: string };
  list_calendar_events: { events: CalEvent[] };
  create_calendar_event: { created: CalEvent };
  update_calendar_event: { updated: CalEvent };
  delete_calendar_event: { deleted: CalEvent };
  day_briefing: Briefing;
  find_free_time: { slots: Slot[] };
}
export type ToolName = keyof ToolResults;

/** One tool call shown to the user as a card. */
export type Card = { [N in ToolName]: { tool: N; data: ToolResults[N] } }[ToolName];

export interface Decision { route: 'quick' | 'agent'; tools: ToolName[]; reason: string }

export interface ChatReply {
  text: string;
  cards: Card[];
  mood: Mood;
  decision?: Decision | null;
  note?: string;
}

export interface Me {
  user: { name?: string; given_name?: string; email?: string; picture?: string };
  profile: Profile;
  calendar: boolean;
  brain: string;
  voice: 'ElevenLabs' | 'off';
  /** 'simli' = photo-real Simli avatar (needs an AI voice to lip-sync); 'cat' = the built-in 2D cat. */
  avatar: 'simli' | 'cat';
}

export interface TranscriptLine { who: 'me' | 'bot'; text: string; at: number; mood?: Mood; tools?: ToolName[] }

export interface AgendaData {
  profile: Profile;
  weather: ToolResults['get_weather'];
  briefings: Briefing[];
  events: CalEvent[] | null; // null = calendar not connected
}
