import * as DocumentPicker from 'expo-document-picker';
import { File as NativeFile } from 'expo-file-system';
import { Platform } from 'react-native';
import { fetch as expoFetch } from 'expo/fetch';
import { api, json } from './api';
import type { FileRecord } from './types';
export type PickedFile = {
  name: string;
  mime: string;
  blob: { size: number; arrayBuffer: () => Promise<ArrayBuffer> };
};
const extensionByMime: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'application/msword': '.doc',
  'application/pdf': '.pdf',
  'text/plain': '.txt',
  'text/markdown': '.md',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
};
const allowedName = /\.(pdf|txt|md|doc|docx|png|jpe?g|webp|gif)$/i;
export function fileNameForUpload(name: string, mime: string): string {
  const cleaned = name.replace(/[\\/\u0000-\u001f\u007f]/g, '_').trim() || 'file';
  if (allowedName.test(cleaned)) return cleaned;
  const ext = extensionByMime[mime];
  return ext ? `${cleaned}${ext}` : cleaned;
}
const fileTypes = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/msword',
  'application/pdf',
  'text/plain',
  'text/markdown',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];
export async function pickFile(): Promise<PickedFile | null> {
  const result = await DocumentPicker.getDocumentAsync({
    multiple: false,
    copyToCacheDirectory: true,
    type: fileTypes,
  });
  if (result.canceled) return null;
  const asset = result.assets[0]!;
  const blob = Platform.OS === 'web' ? asset.file : new NativeFile(asset.uri);
  if (!blob) throw new Error('File could not be opened.');
  if (blob.size > 20 * 1024 * 1024) throw new Error('Choose a file smaller than 20 MiB.');
  const mime =
    asset.mimeType ?? (/\.md$/i.test(asset.name) ? 'text/markdown' : 'application/octet-stream');
  const name = fileNameForUpload(asset.name, mime);
  if (!allowedName.test(name))
    throw new Error(
      'Choose a photo (JPG, PNG, WebP, GIF), Word document (DOC, DOCX), PDF, TXT, or Markdown file.',
    );
  return { name, mime, blob };
}
export async function uploadPicked(picked: PickedFile, chat: string | (() => Promise<string>)) {
  const { blob } = picked;
  const chatId = typeof chat === 'function' ? await chat() : chat;
  const prepared = await api<{
    file: FileRecord;
    upload_url: string;
    required_headers: Record<string, string>;
  }>(
    '/v1/files/uploads',
    json('POST', {
      conversation_id: chatId,
      filename: picked.name,
      byte_size: blob.size,
      declared_mime: picked.mime,
    }),
  );
  const bytes = await blob.arrayBuffer();
  const uploaded = await expoFetch(prepared.upload_url, {
    method: 'PUT',
    headers: { ...prepared.required_headers, 'content-type': picked.mime },
    body: bytes,
  });
  if (!uploaded.ok) throw new Error('Upload failed. Please select the file again.');
  return api<FileRecord>(`/v1/files/${prepared.file.id}/finalize`, json('POST', {}));
}
