import type { Tool } from '../tool.js';
import { CodelabSageError } from '../../utils/errors.js';

interface GeocodingResult {
  results?: Array<{
    latitude: number;
    longitude: number;
    name: string;
    country?: string;
  }>;
}

interface WeatherResult {
  current_weather: {
    temperature: number;
    windspeed: number;
    weathercode: number;
  };
}

const WEATHER_CODES: Record<number, string> = {
  0: 'Clear sky',
  1: 'Mainly clear',
  2: 'Partly cloudy',
  3: 'Overcast',
  45: 'Fog',
  48: 'Depositing rime fog',
  51: 'Light drizzle',
  53: 'Moderate drizzle',
  55: 'Dense drizzle',
  61: 'Slight rain',
  63: 'Moderate rain',
  65: 'Heavy rain',
  71: 'Slight snow',
  73: 'Moderate snow',
  75: 'Heavy snow',
  95: 'Thunderstorm',
};

export function createWeatherTool(): Tool {
  return {
    name: 'weather',
    description: 'Get current weather information for a given city.',
    parameters: {
      type: 'object',
      properties: {
        city: {
          type: 'string',
          description: 'City name',
        },
        units: {
          type: 'string',
          description: 'Units: metric (Celsius) or imperial (Fahrenheit)',
          enum: ['metric', 'imperial'],
          default: 'metric',
        },
      },
      required: ['city'],
    },
    async execute(args) {
      if (typeof args.city !== 'string') {
        throw new CodelabSageError('Parameter "city" must be a string', 'TOOL_INVALID_ARGUMENT');
      }
      const city = args.city;
      const units = typeof args.units === 'string' ? args.units : 'metric';
      const isMetric = units === 'metric';

      const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
        city,
      )}&count=1`;

      const geoRes = await fetch(geoUrl);
      if (!geoRes.ok) {
        throw new CodelabSageError('Failed to query geocoding service', 'TOOL_NETWORK_ERROR');
      }
      const geoData = (await geoRes.json()) as GeocodingResult;
      const location = geoData.results?.[0];
      if (!location) {
        throw new CodelabSageError(`City "${city}" not found`, 'TOOL_NOT_FOUND');
      }

      const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${location.latitude}&longitude=${location.longitude}&current_weather=true&temperature_unit=${isMetric ? 'celsius' : 'fahrenheit'}&windspeed_unit=${isMetric ? 'kmh' : 'mph'}`;

      const weatherRes = await fetch(weatherUrl);
      if (!weatherRes.ok) {
        throw new CodelabSageError('Failed to query weather service', 'TOOL_NETWORK_ERROR');
      }
      const weatherData = (await weatherRes.json()) as WeatherResult;
      const current = weatherData.current_weather;

      const condition = WEATHER_CODES[current.weathercode] ?? 'Unknown';
      const unit = isMetric ? '°C' : '°F';
      const speedUnit = isMetric ? 'km/h' : 'mph';

      return `Weather in ${location.name}${location.country ? `, ${location.country}` : ''}: ${condition}, ${current.temperature}${unit}, wind ${current.windspeed}${speedUnit}.`;
    },
  };
}
