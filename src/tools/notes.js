/** Device notes — CRUD via N-central REST API. */

import { apiGet, apiPost, apiPut, apiDelete, sanitizePathParam } from '../client.js';

export const noteTools = [
  {
    name: 'list_device_notes',
    description: 'Retrieve all notes attached to a specific device.',
    inputSchema: {
      type: 'object',
      properties: {
        deviceId: { type: 'string', description: 'The device ID' },
      },
      required: ['deviceId'],
    },
    handler: async (args) => {
      return await apiGet(`/api/devices/${sanitizePathParam(args.deviceId)}/notes`);
    },
  },
  {
    name: 'add_device_note',
    writeScope: 'write',
    description: 'Add a note to a specific device. Required: text. The N-central API attaches the note to the authenticated user.',
    inputSchema: {
      type: 'object',
      properties: {
        deviceId: { type: 'string', description: 'The device ID' },
        text: { type: 'string', description: 'Note content' },
      },
      required: ['deviceId', 'text'],
    },
    handler: async (args) => {
      return await apiPost(`/api/devices/${sanitizePathParam(args.deviceId)}/notes`, { text: args.text });
    },
  },
  {
    name: 'add_notes_bulk',
    writeScope: 'write',
    description: 'Add the same note to a list of devices in one call. Required: deviceIDs (numeric array), text.',
    inputSchema: {
      type: 'object',
      properties: {
        deviceIDs: { type: 'array', description: 'Device IDs to attach the note to', items: { type: 'integer' } },
        text: { type: 'string', description: 'Note content (applied to every listed device)' },
      },
      required: ['deviceIDs', 'text'],
    },
    handler: async (args) => {
      return await apiPost('/api/devices/notes', { deviceIDs: args.deviceIDs, text: args.text });
    },
  },
  {
    name: 'update_device_note',
    writeScope: 'write',
    description: 'Update an existing note on a device by note ID.',
    inputSchema: {
      type: 'object',
      properties: {
        deviceId: { type: 'string', description: 'The device ID' },
        noteId: { type: 'string', description: 'The note ID to update' },
        text: { type: 'string', description: 'New note content' },
      },
      required: ['deviceId', 'noteId', 'text'],
    },
    handler: async (args) => {
      return await apiPut(
        `/api/devices/${sanitizePathParam(args.deviceId)}/notes/${sanitizePathParam(args.noteId)}`,
        { text: args.text }
      );
    },
  },
  {
    name: 'delete_device_note',
    writeScope: 'destructive',
    description: 'Delete a specific note on a device by note ID. IRREVERSIBLE.',
    inputSchema: {
      type: 'object',
      properties: {
        deviceId: { type: 'string', description: 'The device ID' },
        noteId: { type: 'string', description: 'The note ID to delete' },
      },
      required: ['deviceId', 'noteId'],
    },
    handler: async (args) => {
      return await apiDelete(
        `/api/devices/${sanitizePathParam(args.deviceId)}/notes/${sanitizePathParam(args.noteId)}`
      );
    },
  },
  {
    name: 'clear_device_notes',
    writeScope: 'destructive',
    description: 'Delete ALL notes on a specific device. IRREVERSIBLE.',
    inputSchema: {
      type: 'object',
      properties: {
        deviceId: { type: 'string', description: 'The device ID whose notes to clear' },
      },
      required: ['deviceId'],
    },
    handler: async (args) => {
      return await apiDelete(`/api/devices/${sanitizePathParam(args.deviceId)}/notes`);
    },
  },
];
