import * as DocumentPicker from 'expo-document-picker';
import { File as NativeFile } from 'expo-file-system';
import { Platform } from 'react-native';
import { fetch as expoFetch } from 'expo/fetch';
import { api, json } from './api';
import type { FileRecord } from './types';
type PickedFile = {
  name: string;
  mime: string;
  blob: { size: number; arrayBuffer: () => Promise<ArrayBuffer> };
};
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
  return {
    name: asset.name,
    mime:
      asset.mimeType ?? (/\.md$/i.test(asset.name) ? 'text/markdown' : 'application/octet-stream'),
    blob,
  };
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
export async function pickAndUpload(chat: string | (() => Promise<string>)) {
  const picked = await pickFile();
  if (!picked) return null;
  return uploadPicked(picked, chat);
}
