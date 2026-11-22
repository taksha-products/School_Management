import type { NextFunction, Request, Response } from "express";

/**
 * Marks a response as not cacheable by browsers, proxies or CDNs.
 *
 * Used for personal and live data (a parent's children and bus position, the live map): a
 * stale or shared copy would show an old position, or one parent's data to another.
 */
export const noStore = (_req: Request, res: Response, next: NextFunction): void => {
  res.setHeader("Cache-Control", "no-store");
  next();
};
