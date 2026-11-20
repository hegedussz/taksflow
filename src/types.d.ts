import type { User as AppUser } from './services/userService.js';

declare global {
   
  namespace Express {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface User extends AppUser {}
  }
}

declare module 'express-session' {
  interface SessionData {
    csrfToken?: string;
  }
}

export {};
