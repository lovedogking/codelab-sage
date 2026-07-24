import type { Tool } from '../tool.js';
import { searchFiles, type SearchFilesOptions } from '../../utils/search.js';
import { CodelabSageError } from '../../utils/errors.js';

export function createSearchFilesTool(): Tool {
  return {
    name: 'search_files',
    description:
      'Search for files by name. Uses ripgrep when available, falling back to a Node.js implementation. Returns matching file paths.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The file name (or substring) to search for',
        },
        path: {
          type: 'string',
          description: 'Relative or absolute directory to search within',
        },
        maxResults: {
          type: 'number',
          description: 'Maximum number of matches to return (default: 50)',
        },
      },
      required: ['query'],
    },
    async execute(args) {
      if (typeof args.query !== 'string' || args.query.length === 0) {
        throw new CodelabSageError('Parameter "query" must be a non-empty string', 'TOOL_INVALID_ARGUMENT');
      }

      const options: SearchFilesOptions = {
        query: args.query,
        path: typeof args.path === 'string' ? args.path : undefined,
        maxResults: typeof args.maxResults === 'number' ? args.maxResults : undefined,
      };

      const result = await searchFiles(options);
      if (result.matches.length === 0) {
        return 'No matching files found.';
      }

      return result.matches.map((m) => m.file).join('\n');
    },
  };
}
