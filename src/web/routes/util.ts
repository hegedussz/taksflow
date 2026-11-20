import type { NextFunction, Request, RequestHandler, Response } from 'express';

/** Express 4 nem kezeli a Promise-hibákat, ezért továbbítjuk őket a hibakezelőnek. */
export const ah =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    fn(req, res, next).catch(next);
  };

export function intParam(value: unknown): number | undefined {
  if (typeof value !== 'string' || !/^\d{1,9}$/.test(value)) return undefined;
  return Number(value);
}

export const arrayParam = (value: unknown): string[] =>
  (Array.isArray(value) ? value : value === undefined ? [] : [value]).filter((v): v is string => typeof v === 'string');

export const currentUser = (req: Request) => req.user!;
