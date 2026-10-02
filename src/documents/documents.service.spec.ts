import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Readable } from 'node:stream';
import { downloadName } from './documents.controller.js';
import { detectDocumentType, DocumentsService } from './documents.service.js';

const pdf = Buffer.from('%PDF-1.7\n%test');

function setup() {
  const repo = {
    find: vi.fn(),
    findOne: vi.fn(),
    create: vi.fn((data: object) => data),
    save: vi.fn((data: object) => Promise.resolve({ ...data, id: 'd1' })),
  };
  const storage = {
    put: vi.fn(() => Promise.resolve('local')),
    get: vi.fn(() => Promise.resolve(Readable.from(['file']))),
  };
  const service = new DocumentsService(repo as never, storage as never);
  return { service, repo, storage };
}

describe('documents helpers', () => {
  it('detects PDFs and images by their bytes', () => {
    expect(detectDocumentType(pdf)).toBe('application/pdf');
    expect(detectDocumentType(Buffer.from([0xff, 0xd8, 0xff, 0]))).toBe(
      'image/jpeg',
    );
    expect(detectDocumentType(Buffer.from('<html>'))).toBeNull();
  });

  it('builds a safe download name from the title', () => {
    expect(downloadName('Fumigation Invoice', 'application/pdf')).toBe(
      'Fumigation Invoice.pdf',
    );
    expect(downloadName('../../etc/"passwd"\r\n', 'image/png')).toBe(
      '....etcpasswd.png',
    );
    expect(downloadName('***', 'image/jpeg')).toBe('document.jpg');
  });
});

describe('DocumentsService', () => {
  it('lists documents without storage details', async () => {
    const { service, repo } = setup();
    repo.find.mockResolvedValue([
      {
        id: 'd1',
        type: 'invoice',
        title: 'Invoice',
        reference: 'TX-BK-000001',
        issuedOn: '2026-08-12',
        fileName: 'secret.pdf',
        storage: 'local',
        mimeType: 'application/pdf',
        size: 10,
        user: { id: 'u1' },
      },
    ]);
    const [doc] = await service.listForUser('u1');
    expect(doc).not.toHaveProperty('fileName');
    expect(doc).not.toHaveProperty('storage');
    expect(doc).not.toHaveProperty('user');
    expect(repo.find).toHaveBeenCalledWith(
      expect.objectContaining({ where: { user: { id: 'u1' } } }),
    );
  });

  it("treats another customer's document as not found", async () => {
    const { service, repo, storage } = setup();
    repo.findOne.mockResolvedValue(null);
    await expect(service.openForUser('u2', 'd1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(repo.findOne).toHaveBeenCalledWith({
      where: { id: 'd1', user: { id: 'u2' } },
    });
    expect(storage.get).not.toHaveBeenCalled();
  });

  it('opens the file from where it was stored', async () => {
    const { service, repo, storage } = setup();
    repo.findOne.mockResolvedValue({ fileName: 'a.pdf', storage: 's3' });
    await service.openForUser('u1', 'd1');
    expect(storage.get).toHaveBeenCalledWith('documents/a.pdf', 's3');
  });

  it('reports a missing file as not found', async () => {
    const { service, repo, storage } = setup();
    repo.findOne.mockResolvedValue({ fileName: 'a.pdf', storage: 'local' });
    storage.get.mockRejectedValue(new Error('ENOENT'));
    await expect(service.openForUser('u1', 'd1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('stores new documents under documents/ with a random name', async () => {
    const { service, repo, storage } = setup();
    await service.addForUser(
      'u1',
      { type: 'certificate', title: ' Certificate ', issuedOn: '2026-08-12' },
      pdf,
    );
    const [key, , mimeType] = storage.put.mock.calls[0] as unknown as [
      string,
      Buffer,
      string,
    ];
    expect(key).toMatch(/^documents\/[0-9a-f-]{36}\.pdf$/);
    expect(mimeType).toBe('application/pdf');
    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Certificate',
        reference: null,
        storage: 'local',
        user: { id: 'u1' },
      }),
    );
  });

  it('rejects files that are not PDF or images', async () => {
    const { service, storage } = setup();
    await expect(
      service.addForUser(
        'u1',
        { type: 'invoice', title: 'x', issuedOn: '2026-08-12' },
        Buffer.from('MZ'),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(storage.put).not.toHaveBeenCalled();
  });
});
