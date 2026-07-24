import type { SageConfig, ProviderEntry } from '../config/schema.js';
import type { LLMProvider } from './provider.js';
import { OpenAIProvider } from './openai-provider.js';
import { AnthropicProvider } from './anthropic-provider.js';
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

export function createProviderFromEntry(entry: ProviderEntry): LLMProvider {
  switch (entry.provider) {
    case 'openai':
      return new OpenAIProvider({
        apiKey: entry.apiKey,
        baseURL: entry.baseURL,
      });

    case 'deepseek':
      return new OpenAIProvider({
        apiKey: entry.apiKey,
        baseURL: entry.baseURL ?? 'https://api.deepseek.com/v1',
      });

    case 'ollama':
      return new OpenAIProvider({
        apiKey: entry.apiKey || 'ollama',
        baseURL: entry.baseURL ?? 'http://localhost:11434/v1',
      });

    case 'anthropic':
      return new AnthropicProvider({
        apiKey: entry.apiKey,
        baseURL: entry.baseURL,
      });

    default:
      // Try as OpenAI-compatible with custom baseURL
      if (entry.baseURL) {
        return new OpenAIProvider({
          apiKey: entry.apiKey,
          baseURL: entry.baseURL,
        });
      }
      throw new CodelabSageError(
        `Unsupported provider type: ${entry.provider}. Set a baseURL to use it as OpenAI-compatible.`,
        'UNSUPPORTED_PROVIDER',
      );
  }
}
