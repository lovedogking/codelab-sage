import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export interface GitStatus {
  branch: string | null;
  dirty: boolean;
}

/**
 * Read the current git branch and whether the working tree is dirty.
 * Returns { branch: null, dirty: false } when not inside a git repository.
 */
export async function getGitStatus(cwd?: string): Promise<GitStatus> {
  try {
    const options = cwd ? { cwd } : undefined;

    const [branchResult, statusResult] = await Promise.allSettled([
      execFileAsync('git', ['branch', '--show-current'], options),
      execFileAsync('git', ['status', '--porcelain'], options),
    ]);

    const branch =
      branchResult.status === 'fulfilled'
        ? String(branchResult.value.stdout).trim() || null
        : null;

    const dirty =
      statusResult.status === 'fulfilled'
        ? String(statusResult.value.stdout).trim().length > 0
        : false;

    return { branch, dirty };
  } catch {
    return { branch: null, dirty: false };
  }
}
