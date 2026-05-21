import type { NextFunction, Request, RequestHandler, Response } from "express";

type AsyncRouteHandler = (
  req: Request,
  res: Response,
  next: NextFunction
) => Promise<unknown>;

export const asyncHandler = (handler: AsyncRouteHandler): RequestHandler => {
  // TODO: Wrap async route handlers with centralized error forwarding.
  return (req, res, next): void => {
    void handler(req, res, next).catch(next);
  };
};
