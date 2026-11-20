import type { Pool } from '../db/pool.js';
import type { Clock } from '../domain/time.js';
import { BookingService } from './bookingService.js';
import type { Mailer } from './mailer.js';
import { NotificationService } from './notificationService.js';
import { RoomService } from './roomService.js';
import { StatisticsService } from './statisticsService.js';
import { UserService } from './userService.js';

export interface Services {
  users: UserService;
  rooms: RoomService;
  bookings: BookingService;
  notifications: NotificationService;
  statistics: StatisticsService;
}

export function buildServices(pool: Pool, mailer: Mailer, baseUrl: string, clock: Clock): Services {
  const notifications = new NotificationService(pool, mailer, baseUrl);
  const users = new UserService(pool);
  const rooms = new RoomService(pool, notifications, clock);
  const bookings = new BookingService(pool, rooms, notifications, clock);
  return { users, rooms, bookings, notifications, statistics: new StatisticsService(pool) };
}
