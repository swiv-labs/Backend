import Joi from 'joi';
import { Request, Response, NextFunction } from 'express';
import { errorResponse } from './response';

export const validateRequest = (schema: Joi.ObjectSchema) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const { error } = schema.validate(req.body, { abortEarly: false });
    if (error) {
      const errorMessage = error.details.map((d) => d.message).join(', ');
      return errorResponse(res, 'Validation error', errorMessage, 400);
    }
    next();
  };
};

// Validation Schemas
export const userRegisterSchema = Joi.object({
  walletAddress: Joi.string().required(),
  username: Joi.string().optional().allow(''),
});

export const createPoolSchema = Joi.object({
  assetSymbol: Joi.string().required(),
  targetPrice: Joi.number().positive().required(),
  endTime: Joi.string().isoDate().required(),
  creator: Joi.string().required(),
});

export const createPredictionSchema = Joi.object({
  poolId: Joi.string().uuid().required(),
  userWallet: Joi.string().required(),
  predictedPrice: Joi.number().positive().required(),
  direction: Joi.string().valid('up', 'down').required(),
  amount: Joi.number().positive().required(),
});

export const claimRewardSchema = Joi.object({
  userWallet: Joi.string().required(),
});

export const finalizePoolSchema = Joi.object({
  finalizedBy: Joi.string().optional(),
});