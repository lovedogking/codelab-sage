import { input, select } from '@inquirer/prompts';
import type { ProviderEntry } from '../config/schema.js';

export async function runLoginWizard(): Promise<ProviderEntry | null> {
  try {
    const providerType = await select({
      message: 'Provider type:',
      choices: [
        { name: 'OpenAI', value: 'openai' },
        { name: 'DeepSeek', value: 'deepseek' },
        { name: 'Anthropic (Claude)', value: 'anthropic' },
        { name: 'Ollama (local)', value: 'ollama' },
        { name: 'OpenAI-compatible (custom URL)', value: 'openai' },
      ],
    });

    const apiKey =
      providerType === 'ollama'
        ? await input({
            message: 'API Key (press Enter for default "ollama"):',
            default: 'ollama',
          })
        : await input({
            message: 'API Key:',
            validate: (val) => (val.length > 0 ? true : 'API key is required'),
          });

    let baseURL: string | undefined;
    let model: string;

    if (providerType === 'deepseek') {
      model = 'deepseek-chat';
    } else if (providerType === 'ollama') {
      baseURL =
        (await input({
          message: 'Base URL (press Enter for default):',
          default: 'http://localhost:11434/v1',
        })) || 'http://localhost:11434/v1';
      model = await input({
        message: 'Default model:',
        default: 'llama3',
        validate: (val) => (val.length > 0 ? true : 'Model name is required'),
      });
    } else {
      if (providerType === 'openai') {
        const customUrl = await input({
          message: 'Base URL (press Enter for default):',
        });
        if (customUrl.trim()) {
          baseURL = customUrl.trim();
        }
      }
      model = await input({
        message: 'Default model:',
        default: providerType === 'anthropic' ? 'claude-sonnet-4-20250514' : 'gpt-4o',
        validate: (val) => (val.length > 0 ? true : 'Model name is required'),
      });
    }

    const alias = await input({
      message: 'Alias for this provider:',
      default: providerType,
      validate: (val) => (val.length > 0 ? true : 'Alias is required'),
    });

    return {
      id: alias,
      provider: providerType,
      apiKey,
      baseURL: baseURL || undefined,
      model,
    };
  } catch {
    // User cancelled.
    return null;
  }
}
