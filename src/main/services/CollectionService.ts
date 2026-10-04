import { readFileSync, writeFileSync, existsSync } from 'fs';
import { randomUUID as uuidv4 } from 'crypto';
import { dataPathService } from './paths/index.js';
import type { Collection, CollectionPackage, CollectionExport } from './providers/IUpdateProvider.js';

function collectionsFilePath(): string {
  return dataPathService.getCollectionsFile();
}

function ensureConfigDir(): void {
  dataPathService.ensureDir();
}

function loadCollections(): Collection[] {
  ensureConfigDir();
  if (existsSync(collectionsFilePath())) {
    try {
      const data = readFileSync(collectionsFilePath(), 'utf-8');
      return JSON.parse(data) as Collection[];
    } catch {
      return [];
    }
  }
  return [];
}

function saveCollections(collections: Collection[]): void {
  ensureConfigDir();
  writeFileSync(collectionsFilePath(), JSON.stringify(collections, null, 2), 'utf-8');
}

export class CollectionService {
  private static builtInCollections: Collection[] = [
    {
      id: 'builtin-essentials',
      name: 'Essentials',
      description: 'Essential development and productivity tools',
      isBuiltIn: true,
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
      packages: [
        { id: 'Git.Git' },
        { id: 'Microsoft.VisualStudioCode' },
        { id: '7zip.7zip' },
        { id: 'Microsoft.PowerToys' },
      ],
    },
    {
      id: 'builtin-devtools',
      name: 'Developer Tools',
      description: 'Common development utilities and runtimes',
      isBuiltIn: true,
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
      packages: [
        { id: 'GitHub.GitHubDesktop' },
        { id: 'Microsoft.WindowsTerminal' },
        { id: 'Docker.DockerDesktop' },
        { id: 'Postman.Postman' },
      ],
    },
    {
      id: 'builtin-media',
      name: 'Media & Entertainment',
      description: 'Media players and streaming applications',
      isBuiltIn: true,
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
      packages: [
        { id: 'VideoLAN.VLC' },
        { id: 'Spotify.Spotify' },
        { id: 'OBSProject.OBSStudio' },
      ],
    },
  ];

  static getAll(): Collection[] {
    const userCollections = loadCollections();
    return [...this.builtInCollections, ...userCollections];
  }

  static getById(id: string): Collection | null {
    const all = this.getAll();
    return all.find(c => c.id === id) || null;
  }

  static create(data: Omit<Collection, 'id' | 'createdAt' | 'updatedAt'>): Collection {
    const collections = loadCollections();
    const now = new Date().toISOString();
    const collection: Collection = {
      ...data,
      id: uuidv4(),
      isBuiltIn: false,
      createdAt: now,
      updatedAt: now,
    };
    collections.push(collection);
    saveCollections(collections);
    return collection;
  }

  static update(id: string, updates: Partial<Collection>): Collection | null {
    const collections = loadCollections();
    const index = collections.findIndex(c => c.id === id);
    if (index === -1) return null;
    
    const builtIn = this.builtInCollections.find(c => c.id === id);
    if (builtIn) return null; // Cannot modify built-in collections

    const updated = {
      ...collections[index],
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    collections[index] = updated;
    saveCollections(collections);
    return updated;
  }

  static delete(id: string): boolean {
    const collections = loadCollections();
    const index = collections.findIndex(c => c.id === id);
    if (index === -1) return false;
    
    const builtIn = this.builtInCollections.find(c => c.id === id);
    if (builtIn) return false; // Cannot delete built-in collections

    collections.splice(index, 1);
    saveCollections(collections);
    return true;
  }

  static export(id: string): CollectionExport | null {
    const collection = this.getById(id);
    if (!collection) return null;

    return {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      collection: { ...collection, isBuiltIn: false }, // Exported collections are not built-in
    };
  }

  static import(data: CollectionExport): Collection {
    const collections = loadCollections();
    const now = new Date().toISOString();
    const collection: Collection = {
      ...data.collection,
      id: uuidv4(),
      isBuiltIn: false,
      createdAt: now,
      updatedAt: now,
    };
    collections.push(collection);
    saveCollections(collections);
    return collection;
  }

  static getInstallablePackages(collection: Collection): CollectionPackage[] {
    return collection.packages.filter(p => p.id);
  }
}