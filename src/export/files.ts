import { Directory, File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

const RECORDINGS_DIR = 'recordings';

function recordingsDir(): Directory {
  const dir = new Directory(Paths.document, RECORDINGS_DIR);
  if (!dir.exists) dir.create({ idempotent: true, intermediates: true });
  return dir;
}

/** Persist a raw CSV next to the database (dev mode only). Returns the file URI. */
export function saveRawRecording(sessionId: string, csv: string): string {
  const file = new File(recordingsDir(), `${sessionId}.csv`);
  file.writeSync(csv);
  return file.uri;
}

export function deleteRawRecording(uri: string | null): void {
  if (!uri) return;
  try {
    const f = new File(uri);
    if (f.exists) f.delete();
  } catch (e) {
    console.warn('could not delete raw recording', e);
  }
}

export function deleteAllRawRecordings(): void {
  try {
    const dir = new Directory(Paths.document, RECORDINGS_DIR);
    if (dir.exists) dir.delete();
  } catch (e) {
    console.warn('could not delete recordings directory', e);
  }
}

export function readTextFile(uri: string): string | null {
  try {
    const f = new File(uri);
    return f.exists ? f.textSync() : null;
  } catch {
    return null;
  }
}

/** Write text to the cache directory and open the system share sheet. */
export async function shareText(fileName: string, text: string, mimeType: string, dialogTitle: string): Promise<void> {
  const file = new File(Paths.cache, fileName);
  file.writeSync(text);
  await shareFile(file.uri, mimeType, dialogTitle);
}

export async function shareFile(uri: string, mimeType: string, dialogTitle: string): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('Sharing is not available on this device.');
  }
  await Sharing.shareAsync(uri, {
    mimeType,
    dialogTitle,
    UTI: mimeType === 'application/pdf' ? 'com.adobe.pdf' : 'public.comma-separated-values-text',
  });
}

/** Render HTML to a PDF and share it. */
export async function shareHtmlAsPdf(html: string, dialogTitle: string): Promise<void> {
  const { uri } = await Print.printToFileAsync({ html });
  await shareFile(uri, 'application/pdf', dialogTitle);
}
