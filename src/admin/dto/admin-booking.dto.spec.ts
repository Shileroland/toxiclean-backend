import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ScheduleDto } from './admin-booking.dto.js';

const schedule = { date: '2026-11-20', startTime: '10:00', endTime: '13:00' };

describe('ScheduleDto', () => {
  it('accepts a job with nobody assigned yet (multipart leaves the field out)', async () => {
    const dto = plainToInstance(ScheduleDto, schedule);
    expect(dto.fumigatorIds).toEqual([]);
    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('accepts a single fumigator sent as one value', async () => {
    const id = '0f8fad5b-d9cb-469f-a165-70867728950e';
    const dto = plainToInstance(ScheduleDto, { ...schedule, fumigatorIds: id });
    expect(dto.fumigatorIds).toEqual([id]);
    await expect(validate(dto)).resolves.toHaveLength(0);
  });
});
