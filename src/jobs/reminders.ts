import type { Pool } from '../db/pool.js';
import { REMINDER_MINUTES, type Clock } from '../domain/time.js';
import type { NotificationService } from '../services/notificationService.js';

/**
 * ÜtemezettFeladatok.emlékeztetőkKüldése (FR-08). Az UPDATE … RETURNING egy lépésben „lefoglalja”
 * az elküldendő emlékeztetőket, így több példány esetén sem megy ki kétszer ugyanaz a levél.
 * A kikapcsolt emlékeztetőjű felhasználók foglalásait kihagyja (AC-08.2).
 */
export async function sendDueReminders(db: Pool, notifications: NotificationService, clock: Clock): Promise<number> {
  const now = clock();
  const until = new Date(now.getTime() + REMINDER_MINUTES * 60_000);
  const { rows } = await db.query<{ id: number }>(
    `UPDATE bookings b SET reminder_sent_at = $1
     FROM users u
     WHERE u.id = b.user_id AND u.reminders_enabled AND b.status = 'active' AND b.reminder_sent_at IS NULL
       AND lower(b.period) > $1 AND lower(b.period) <= $2
     RETURNING b.id`,
    [now, until],
  );
  await notifications.bookingReminders(rows.map((r) => r.id));
  return rows.length;
}

export function startReminderJob(db: Pool, notifications: NotificationService, clock: Clock, intervalMs = 60_000) {
  const timer = setInterval(() => {
    sendDueReminders(db, notifications, clock).catch((err) => console.error('Emlékeztető-feladat hiba:', err));
  }, intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}
