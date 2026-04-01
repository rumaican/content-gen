/**
 * File utilities — fs helpers used across pipeline components.
 */

import * as fs from 'fs';
import * as path from 'path';

/**
 * Returns the file extension (without leading dot) from a path.
 * Returns empty string if no extension found.
 */
export function getFileExt(filePath: string): string {
  const base = path.basename(filePath);
  const dotIndex = base.lastIndexOf('.');
  if (dotIndex === -1 || dotIndex === 0) return '';
  return base.slice(dotIndex + 1).toLowerCase();
}

/**
 * Returns the size of a file in bytes.
 * @throws Error if the file does not exist.
 */
export function getFileSize(filePath: string): number {
  const stats = fs.statSync(filePath);
  return stats.size;
}

/**
 * Ensures a directory exists, creating it and all parent directories if needed.
 * Does not throw if the directory already exists.
 */
export function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}
