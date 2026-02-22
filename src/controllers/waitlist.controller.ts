import { Request, Response, NextFunction } from 'express';
import { WaitlistModel, CreateWaitlistParams } from '../models/Waitlist';
import { successResponse, errorResponse } from '../utils/response';

export class WaitlistController {
  static async join(req: Request, res: Response, next: NextFunction) {
    try {
      const { xUsername, email } = req.body;

      // Check if email already exists in waitlist
      const existingByEmail = await WaitlistModel.findByEmail(email);
      if (existingByEmail) {
        return errorResponse(res, 'This email is already on the waitlist', null, 409);
      }

      // Check if X username already exists in waitlist
      const existingByUsername = await WaitlistModel.findByXUsername(xUsername);
      if (existingByUsername) {
        return errorResponse(res, 'This X username is already on the waitlist', null, 409);
      }

      const waitlistParams: CreateWaitlistParams = {
        xUsername,
        email,
      };

      const entry = await WaitlistModel.create(waitlistParams);

      return successResponse(
        res,
        'Successfully joined the waitlist!',
        {
          id: entry.id,
          xUsername: entry.x_username,
          email: entry.email,
          createdAt: entry.created_at,
        },
        201
      );
    } catch (error) {
      next(error);
    }
  }

  static async getAll(req: Request, res: Response, next: NextFunction) {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
      const offset = req.query.offset ? parseInt(req.query.offset as string) : 0;

      const [entries, total] = await Promise.all([
        WaitlistModel.getAll(limit, offset),
        WaitlistModel.getCount(),
      ]);

      return successResponse(res, 'Waitlist entries retrieved successfully', {
        entries,
        total,
        limit,
        offset,
      });
    } catch (error) {
      next(error);
    }
  }

  static async getStats(req: Request, res: Response, next: NextFunction) {
    try {
      const total = await WaitlistModel.getCount();

      return successResponse(res, 'Waitlist stats retrieved successfully', {
        total,
      });
    } catch (error) {
      next(error);
    }
  }
}
