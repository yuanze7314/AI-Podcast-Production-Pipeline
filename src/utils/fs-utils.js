import fs from 'fs';
import path from 'path';

export function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

export function ensureParentDir(filePath) {
  ensureDir(path.dirname(filePath));
}

export function writeJson(filePath, data) {
  ensureParentDir(filePath);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

export function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

export function listFiles(dirPath, predicate = () => true) {
  if (!fs.existsSync(dirPath)) return [];
  return fs.readdirSync(dirPath).filter(predicate).sort();
}
