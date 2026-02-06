import { Request, Response, NextFunction } from 'express';
import { UserModel, CreateUserParams } from '../models/User';
import { successResponse, errorResponse } from '../utils/response';
import { AppError } from '../utils/errorHandler';

export class UsersController {
  static async register(req: Request, res: Response, next: NextFunction) {
    try {
      const {
        walletAddress,
        authMethod,
        authIdentifier,
        privyUserId,
        username,
        email,
        avatarUrl,
        isEmailVerified,
      } = req.body;

      const existingUser = await UserModel.findByWallet(walletAddress);
      if (existingUser) {
        return errorResponse(res, 'User with this wallet already registered', null, 409);
      }

      if (authMethod !== 'wallet') {
        const existingByAuth = await UserModel.findByAuthIdentifier(authIdentifier);
        if (existingByAuth) {
          return errorResponse(
            res,
            `User with this ${authMethod} already registered`,
            null,
            409
          );
        }
      }

      if (privyUserId) {
        const existingByPrivy = await UserModel.findByPrivyId(privyUserId);
        if (existingByPrivy) {
          return errorResponse(res, 'User with this Privy ID already registered', null, 409);
        }
      }

      const userParams: CreateUserParams = {
        walletAddress,
        authMethod,
        authIdentifier,
        privyUserId,
        username,
        email,
        avatarUrl,
        isEmailVerified,
      };

      const user = await UserModel.create(userParams);

      return successResponse(
        res,
        'User registered successfully',
        {
          id: user.id,
          walletAddress: user.wallet_address,
          authMethod: user.auth_method,
          username: user.username,
          email: user.email,
          avatarUrl: user.avatar_url,
          isEmailVerified: user.is_email_verified,
          createdAt: user.created_at,
        },
        201
      );
    } catch (error) {
      next(error);
    }
  }

  static async login(req: Request, res: Response, next: NextFunction) {
    try {
      const { walletAddress, privyUserId } = req.body;

      let user = null;

      if (walletAddress) {
        user = await UserModel.findByWallet(walletAddress);
      }

      if (!user && privyUserId) {
        user = await UserModel.findByPrivyId(privyUserId);
      }

      if (!user) {
        throw new AppError('User not found. Please register first.', 404);
      }

      await UserModel.updateLastLogin(user.wallet_address);

      return successResponse(res, 'Login successful', {
        id: user.id,
        walletAddress: user.wallet_address,
        authMethod: user.auth_method,
        username: user.username,
        email: user.email,
        avatarUrl: user.avatar_url,
        isEmailVerified: user.is_email_verified,
        lastLoginAt: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  }

  static async getProfile(req: Request, res: Response, next: NextFunction) {
    try {
      const { walletAddress } = req.params;

      const user = await UserModel.findByWallet(walletAddress);
      if (!user) {
        throw new AppError('User not found', 404);
      }

      return successResponse(res, 'User profile retrieved', {
        id: user.id,
        walletAddress: user.wallet_address,
        username: user.username,
        authMethod: user.auth_method,
        email: user.email,
        avatarUrl: user.avatar_url,
        isEmailVerified: user.is_email_verified,
        createdAt: user.created_at,
        lastLoginAt: user.last_login_at,
      });
    } catch (error) {
      next(error);
    }
  }

  static async updateProfile(req: Request, res: Response, next: NextFunction) {
    try {
      const { walletAddress } = req.params;
      const { username, avatarUrl } = req.body;

      const user = await UserModel.findByWallet(walletAddress);
      if (!user) {
        throw new AppError('User not found', 404);
      }

      const updates: any = {};
      if (username !== undefined) updates.username = username;
      if (avatarUrl !== undefined) updates.avatar_url = avatarUrl;

      const updatedUser = await UserModel.update(walletAddress, updates);

      return successResponse(res, 'Profile updated successfully', {
        id: updatedUser.id,
        walletAddress: updatedUser.wallet_address,
        username: updatedUser.username,
        avatarUrl: updatedUser.avatar_url,
        updatedAt: updatedUser.updated_at,
      });
    } catch (error) {
      next(error);
    }
  }

  static async getAuthStats(req: Request, res: Response, next: NextFunction) {
    try {
      const stats = await UserModel.getAuthMethodStats();
      return successResponse(res, 'Auth statistics retrieved', stats);
    } catch (error) {
      next(error);
    }
  }
}