/**
 * Updates a booking from the team side until the admin exists:
 *
 *   npm run bookings:update -- --reference TX-BK-000001 --status scheduled \
 *     --date 2026-08-12 --time 10:00 --fumigator "Michael Adeyemi"
 *   npm run bookings:update -- --reference TX-BK-000001 --confirm-reschedule --time 09:00
 *   npm run bookings:update -- --reference TX-BK-000001 --confirm-cancellation
 *   npm run bookings:update -- --reference TX-BK-000001 --decline-request
 *
 * Statuses: requested, scheduled, on_the_way, in_progress, completed, follow_up_required, closed.
 */
import { NestFactory } from '@nestjs/core';
import { parseArgs } from 'node:util';
import { AppModule } from '../app.module.js';
import {
  BOOKING_STATUSES,
  type BookingStatus,
} from '../bookings/booking.entity.js';
import { BookingsService } from '../bookings/bookings.service.js';

const { values } = parseArgs({
  options: {
    reference: { type: 'string' },
    status: { type: 'string' },
    date: { type: 'string' },
    time: { type: 'string' },
    fumigator: { type: 'string' },
    'confirm-reschedule': { type: 'boolean' },
    'confirm-cancellation': { type: 'boolean' },
    'decline-request': { type: 'boolean' },
  },
});

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

const { reference, status, date, time, fumigator } = values;
if (!reference) fail('Required: --reference TX-BK-000001');
if (status && !BOOKING_STATUSES.includes(status as BookingStatus)) {
  fail(`--status must be one of: ${BOOKING_STATUSES.join(', ')}`);
}
if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date))
  fail('--date must be YYYY-MM-DD');
if (time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
  fail('--time must be 24-hour HH:MM, e.g. 14:30');
}

const app = await NestFactory.createApplicationContext(AppModule, {
  logger: ['error', 'warn'],
});
try {
  const booking = await app.get(BookingsService).updateByReference(reference, {
    status: status as BookingStatus | undefined,
    scheduledDate: date,
    scheduledTime: time,
    assignedFumigator: fumigator,
    confirmReschedule: values['confirm-reschedule'],
    confirmCancellation: values['confirm-cancellation'],
    declineRequest: values['decline-request'],
  });
  console.log(
    `${booking.reference}: ${booking.status}` +
      (booking.scheduledDate
        ? `, ${booking.scheduledDate} ${booking.scheduledTime ?? ''}`
        : ''),
  );
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await app.close();
}
