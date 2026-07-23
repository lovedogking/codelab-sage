import type { SageConfig } from '../config/schema.js';
import type { LLMProvider } from './provider.js';
import { OpenAIProvider } from './openai-provider.js';
import { CodelabSageError } from '../utils/errors.js';

export function createLLMProvider(config: SageConfig): LLMProvider {
  const provider = config.provider ?? 'openai';

  switch (provider) {
    case 'openai':
      if (!config.apiKey) {
        throw new CodelabSageError('API key is required for OpenAI provider', 'MISSING_API_KEY');
      }
      return new OpenAIProvider({
        apiKey: config.apiKey,
        baseURL: config.baseURL,
      });
    default:
      throw new CodelabSageError(`Unsupported LLM provider: ${provider}`, 'UNSUPPORTED_PROVIDER');
  }
}
