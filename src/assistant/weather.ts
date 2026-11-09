// Open-Meteo: public weather API, no key and no user token needed.
import type { Units, Weather } from '../types.ts';

const EN: Record<number, string> = { 0: 'clear', 1: 'mostly clear', 2: 'partly cloudy', 3: 'overcast', 45: 'foggy', 48: 'foggy',
  51: 'light drizzle', 53: 'drizzle', 55: 'heavy drizzle', 61: 'light rain', 63: 'rain', 65: 'heavy rain',
  71: 'light snow', 73: 'snow', 75: 'heavy snow', 80: 'rain showers', 81: 'rain showers', 82: 'violent showers',
  95: 'thunderstorm', 96: 'thunderstorm with hail', 99: 'thunderstorm with hail' };
const ID: Record<number, string> = { 0: 'cerah', 1: 'cerah berawan', 2: 'berawan sebagian', 3: 'mendung', 45: 'berkabut', 48: 'berkabut',
  51: 'gerimis ringan', 53: 'gerimis', 55: 'gerimis lebat', 61: 'hujan ringan', 63: 'hujan', 65: 'hujan lebat',
  71: 'salju ringan', 73: 'salju', 75: 'salju lebat', 80: 'hujan lokal', 81: 'hujan lokal', 82: 'hujan sangat lebat',
  95: 'badai petir', 96: 'badai petir disertai es', 99: 'badai petir disertai es' };

interface Geo { results?: { name: string; country: string; latitude: number; longitude: number }[] }
interface Forecast {
  current: { temperature_2m: number; apparent_temperature?: number; relative_humidity_2m?: number; wind_speed_10m?: number; weather_code: number; is_day: number };
  daily?: { time: string[]; weather_code: number[]; temperature_2m_max: number[]; temperature_2m_min: number[]; precipitation_probability_max?: (number | null)[] };
}

/** Current weather in `city`, plus a daily forecast for `days` days (0 = none). Null when the place is unknown. */
export async function weather(city: string, units: Units, days = 0, fetchFn: typeof fetch = fetch): Promise<Weather | null> {
  const getJson = async <T>(url: string): Promise<T> => {
    const res = await fetchFn(url);
    if (!res.ok) throw new Error(`Open-Meteo ${res.status}`);
    return res.json() as Promise<T>;
  };
  const geo = await getJson<Geo>(`https://geocoding-api.open-meteo.com/v1/search?count=1&name=${encodeURIComponent(city)}`);
  const place = geo.results?.[0];
  if (!place) return null;
  const q = new URLSearchParams({ latitude: String(place.latitude), longitude: String(place.longitude), temperature_unit: units, timezone: 'auto',
    current: 'temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code,is_day' });
  if (days > 0) {
    q.set('daily', 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max');
    q.set('forecast_days', String(Math.min(days, 7)));
  }
  const { current: c, daily: d } = await getJson<Forecast>(`https://api.open-meteo.com/v1/forecast?${q}`);
  return {
    place: `${place.name}, ${place.country}`, temp: c.temperature_2m, feels: c.apparent_temperature,
    humidity: c.relative_humidity_2m, wind: c.wind_speed_10m, code: c.weather_code, day: c.is_day === 1,
    unit: units === 'fahrenheit' ? '°F' : '°C', desc: EN[c.weather_code] ?? 'unknown conditions', descId: ID[c.weather_code] ?? 'tidak diketahui',
    ...(d && { forecast: d.time.map((date, i) => ({
      date, code: d.weather_code[i], desc: EN[d.weather_code[i]] ?? 'unknown', descId: ID[d.weather_code[i]] ?? 'tidak diketahui',
      max: d.temperature_2m_max[i], min: d.temperature_2m_min[i], rain: d.precipitation_probability_max?.[i] ?? null,
    })) }),
  };
}
