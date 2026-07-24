import type { Tool } from '../tool.js';
import { searchCode, type SearchCodeOptions } from '../../utils/search.js';
import { CodelabSageError } from '../../utils/errors.js';

export function createSearchCodeTool(): Tool {
  return {
    name: 'search_code',
    description:
      'Search file contents for a pattern. Uses ripgrep when available, falling back to a Node.js implementation. Returns matching file paths, line numbers, and snippets.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The text or regex pattern to search for',
        },
        path: {
          type: 'string',
          description: 'Relative or absolute directory/file to search within',
        },
        filePattern: {
          type: 'string',
          description: 'Glob pattern to limit which files are searched, e.g. "*.ts"',
        },
        caseSensitive: {
          type: 'boolean',
          description: 'Perform a case-sensitive search (default: false)',
        },
        contextLines: {
          type: 'number',
          description: 'Number of context lines around each match (default: 2)',
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

      const options: SearchCodeOptions = {
        query: args.query,
        path: typeof args.path === 'string' ? args.path : undefined,
        filePattern: typeof args.filePattern === 'string' ? args.filePattern : undefined,
        caseSensitive: typeof args.caseSensitive === 'boolean' ? args.caseSensitive : undefined,
        contextLines: typeof args.contextLines === 'number' ? args.contextLines : undefined,
        maxResults: typeof args.maxResults === 'number' ? args.maxResults : undefined,
      };

      const result = await searchCode(options);
      if (result.matches.length === 0) {
        return 'No matches found.';
      }

      return result.matches
        .map((m) => `${m.file}:${m.line}\n${m.content}`)
        .join('\n\n');
    },
  };
}
