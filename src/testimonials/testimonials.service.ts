import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { StoredFile } from '../catalog/catalog.entity.js';
import {
  fileInfo,
  storeCatalogFile,
  type Upload,
} from '../catalog/file-storage.js';
import { StorageService } from '../storage/storage.service.js';
import type { TestimonialDto } from './testimonial.dto.js';
import { Testimonial, type TestimonialSegment } from './testimonial.entity.js';

export const PAGE_SIZE = 10;

const escapeLike = (q: string) => `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

/**
 * The order after moving `id` one place up or down, or null when it is already at
 * that end. Pure, so the reordering rule is testable without a database.
 */
export function moved(ids: string[], id: string, direction: 'up' | 'down') {
  const from = ids.indexOf(id);
  const to = direction === 'up' ? from - 1 : from + 1;
  if (from < 0 || to < 0 || to >= ids.length) return null;
  const next = [...ids];
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}

@Injectable()
export class TestimonialsService {
  constructor(
    @InjectRepository(Testimonial)
    private readonly testimonials: Repository<Testimonial>,
    private readonly storage: StorageService,
  ) {}

  private details(t: Testimonial) {
    return {
      id: t.id,
      authorName: t.authorName,
      authorRole: t.authorRole,
      authorRoleFr: t.authorRoleFr,
      location: t.location,
      segment: t.segment,
      quote: t.quote,
      quoteFr: t.quoteFr,
      photo: fileInfo(t.photo),
      published: t.published,
      position: t.position,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    };
  }

  private async find(id: string) {
    const t = await this.testimonials.findOneBy({ id });
    if (!t) throw new NotFoundException('Testimonial not found.');
    return t;
  }

  /** Admin list, in display order: ?q (name, role, location, quote), segment, visibility. */
  async page({
    q,
    segments,
    published,
    page,
  }: {
    q?: string;
    segments?: TestimonialSegment[];
    published?: boolean;
    page: number;
  }) {
    const query = this.testimonials
      .createQueryBuilder('t')
      .orderBy('t.position')
      .addOrderBy('t.createdAt')
      .skip((page - 1) * PAGE_SIZE)
      .take(PAGE_SIZE);
    if (q) {
      query.where(
        '(t.authorName ILIKE :like OR t.authorRole ILIKE :like OR t.location ILIKE :like OR t.quote ILIKE :like)',
        { like: escapeLike(q) },
      );
    }
    if (segments?.length) {
      query.andWhere('t.segment IN (:...segments)', { segments });
    }
    if (published !== undefined) {
      query.andWhere('t.published = :published', { published });
    }
    const [rows, total] = await query.getManyAndCount();
    return {
      items: rows.map((t) => this.details(t)),
      total,
      page,
      pageSize: PAGE_SIZE,
    };
  }

  async get(id: string) {
    return this.details(await this.find(id));
  }

  private apply(t: Testimonial, dto: TestimonialDto) {
    t.authorName = dto.authorName;
    t.authorRole = dto.authorRole ?? '';
    t.authorRoleFr = dto.authorRoleFr || null;
    t.location = dto.location ?? '';
    t.segment = dto.segment;
    t.quote = dto.quote;
    t.quoteFr = dto.quoteFr ?? '';
    if (dto.published !== undefined) t.published = dto.published;
  }

  /** New testimonials go to the end of the list. */
  async create(dto: TestimonialDto) {
    const last = await this.testimonials
      .createQueryBuilder('t')
      .select('MAX(t.position)', 'max')
      .getRawOne<{ max: number | null }>();
    const t = this.testimonials.create({ position: (last?.max ?? -1) + 1 });
    this.apply(t, dto);
    return this.details(await this.testimonials.save(t));
  }

  async update(id: string, dto: TestimonialDto) {
    const t = await this.find(id);
    this.apply(t, dto);
    return this.details(await this.testimonials.save(t));
  }

  async setVisibility(id: string, published: boolean) {
    const t = await this.find(id);
    t.published = published;
    return this.details(await this.testimonials.save(t));
  }

  /** Swaps with its neighbour in the full display order, then renumbers 0..n. */
  async move(id: string, direction: 'up' | 'down') {
    await this.find(id);
    await this.testimonials.manager.transaction(async (em) => {
      const all = await em.find(Testimonial, {
        select: { id: true },
        order: { position: 'ASC', createdAt: 'ASC' },
      });
      const order = moved(
        all.map((t) => t.id),
        id,
        direction,
      );
      if (!order) return;
      for (const [position, tid] of order.entries()) {
        await em.update(Testimonial, tid, { position });
      }
    });
    return this.get(id);
  }

  async remove(id: string) {
    const t = await this.find(id);
    await this.testimonials.remove(t);
    if (t.photo) await this.removeFile(t.photo);
  }

  /** Replaces the photo or logo (PNG/JPG, up to 5MB). */
  async setPhoto(id: string, file: Upload) {
    const t = await this.find(id);
    const old = t.photo;
    t.photo = await storeCatalogFile(file, this.storage, 'testimonials', {
      images: true,
      noun: 'photo',
    });
    await this.testimonials.save(t);
    if (old) await this.removeFile(old);
    return this.details(t);
  }

  async removePhoto(id: string) {
    const t = await this.find(id);
    const old = t.photo;
    if (old) {
      t.photo = null;
      await this.testimonials.save(t);
      await this.removeFile(old);
    }
    return this.details(t);
  }

  /** Public: what the website shows, in display order. */
  async published() {
    const rows = await this.testimonials.find({
      where: { published: true },
      order: { position: 'ASC', createdAt: 'ASC' },
    });
    return rows.map((t) => ({
      id: t.id,
      authorName: t.authorName,
      authorRole: t.authorRole,
      authorRoleFr: t.authorRoleFr,
      location: t.location,
      segment: t.segment,
      quote: t.quote,
      quoteFr: t.quoteFr,
      photo: t.photo?.fileName ?? null,
    }));
  }

  /** Public, by stored name, and only for published testimonials. */
  async openPhoto(fileName: string) {
    const t = await this.testimonials
      .createQueryBuilder('t')
      .where(`t.photo->>'fileName' = :fileName`, { fileName })
      .andWhere('t.published = true')
      .getOne();
    if (!t?.photo) throw new NotFoundException('Photo not found.');
    const stream = await this.storage
      .get(`testimonials/${t.photo.fileName}`, t.photo.storage)
      .catch(() => {
        throw new NotFoundException('The file is missing.');
      });
    return { file: t.photo, stream };
  }

  /** Admin preview of any testimonial's photo, published or not. */
  async openPhotoFor(id: string) {
    const t = await this.find(id);
    if (!t.photo) throw new NotFoundException('No photo.');
    const stream = await this.storage
      .get(`testimonials/${t.photo.fileName}`, t.photo.storage)
      .catch(() => {
        throw new NotFoundException('The file is missing.');
      });
    return { file: t.photo, stream };
  }

  private removeFile(file: StoredFile) {
    return this.storage
      .delete(`testimonials/${file.fileName}`, file.storage)
      .catch(() => {});
  }
}
