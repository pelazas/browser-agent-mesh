import { createLogger } from '@utils/logging';

const log = createLogger('opfs-fs');

export async function readFile(path: string): Promise<string> {
  try {
    const root = await navigator.storage.getDirectory();
    const fileHandle = await root.getFileHandle(path);
    const file = await fileHandle.getFile();
    const content = await file.text();
    log.info('file read', { path, bytes: content.length });
    return content;
  } catch (err) {
    log.error('file read failed', { path, error: String(err) });
    throw err;
  }
}

export async function writeFile(path: string, content: string): Promise<void> {
  try {
    const root = await navigator.storage.getDirectory();

    // Ensure parent directories exist
    const parts = path.split('/');
    let current = root;
    for (let i = 0; i < parts.length - 1; i++) {
      if (parts[i]) {
        current = await current.getDirectoryHandle(parts[i], { create: true });
      }
    }

    const fileName = parts[parts.length - 1];
    const fileHandle = await current.getFileHandle(fileName, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(content);
    await writable.close();

    log.info('file written', { path, bytes: content.length });
  } catch (err) {
    log.error('file write failed', { path, error: String(err) });
    throw err;
  }
}

export async function listFiles(dirPath: string = ''): Promise<string[]> {
  try {
    const root = await navigator.storage.getDirectory();
    let dir = root;

    if (dirPath) {
      const parts = dirPath.split('/').filter(Boolean);
      for (const part of parts) {
        dir = await dir.getDirectoryHandle(part);
      }
    }

    const entries: string[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for await (const [name, handle] of (dir as any).entries()) {
      entries.push(handle.kind === 'directory' ? `${name}/` : name);
    }

    return entries;
  } catch (err) {
    log.error('list failed', { dirPath, error: String(err) });
    return [];
  }
}
