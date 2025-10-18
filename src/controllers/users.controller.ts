import { Request, Response, NextFunction } from 'express';
import { UserModel } from '../models/User';
import { successResponse, errorResponse } from '../utils/response';
import { AppError } from '../utils/errorHandler';

export class UsersController {
  /**
   * Register a new user
   */
  static async register(req: Request, res: Response, next: NextFunction) {
    try {
      const { walletAddress, username } = req.body;

      // Check if user already exists
      const existingUser = await UserModel.findByWallet(walletAddress);
      if (existingUser) {
        return errorResponse(res, 'User already registered', null, 409);
      }

      const user = await UserModel.create(walletAddress, username);
      return successResponse(res, 'User registered successfully', user, 201);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get user profile
   */
  static async getProfile(req: Request, res: Response, next: NextFunction) {
    try {
      const { walletAddress } = req.params;

      const user = await UserModel.findByWallet(walletAddress);
      if (!user) {
        throw new AppError('User not found', 404);
      }

      return successResponse(res, 'User profile retrieved', user);
    } catch (error) {
      next(error);
    }
  }
}