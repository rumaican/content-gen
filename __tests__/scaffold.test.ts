/**
 * __tests__/scaffold.test.ts
 * TDD: verify all required directories and files exist after scaffold.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const root = path.resolve(__dirname, '..');

const REQUIRED_DIRS = ['downloads', 'transcripts', 'outputs', 'logs'];
const REQUIRED_FILES = [
  'package.json',
  'tsconfig.json',
  '.env.example',
  'src/index.ts',
  'src/config/index.ts',
  'src/pipelines/index.ts',
];

describe('scaffold', () => {
  it('test_folder_structure_exists', () => {
    for (const dir of REQUIRED_DIRS) {
      const dirPath = path.join(root, dir);
      expect(fs.existsSync(dirPath), `Directory ${dir} should exist`).toBe(true);
    }
  });

  it('test_required_files_exist', () => {
    for (const file of REQUIRED_FILES) {
      const filePath = path.join(root, file);
      expect(fs.existsSync(filePath), `File ${file} should exist`).toBe(true);
    }
  });
});
