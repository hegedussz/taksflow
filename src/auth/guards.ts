import type { NextFunction, Request, Response } from 'express';
import { ForbiddenError } from '../domain/errors.js';

const isApi = (req: Request) => req.originalUrl.startsWith('/api/');

export function requireUser(req: Request, res: Response, next: NextFunction): void {
  if (req.user) return next();
  if (isApi(req)) {
    res.status(401).json({ error: 'error.unauthenticated' });
    return;
  }
  res.redirect('/login');
}

/** AC-09.3: hallgató nem érheti el az adminisztrátori oldalakat. */
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  requireUser(req, res, () => {
    if (req.user?.role !== 'admin') return next(new ForbiddenError('error.admin_only'));
    next();
  });
}
