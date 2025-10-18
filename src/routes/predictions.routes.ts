import { Router } from 'express';
import { PredictionsController } from '../controllers/predictions.controller';
import { validateRequest, createPredictionSchema, claimRewardSchema } from '../utils/validator';
import { asyncHandler } from '../utils/errorHandler';

const router = Router();

router.post(
  '/',
  validateRequest(createPredictionSchema),
  asyncHandler(PredictionsController.createPrediction)
);

router.get(
  '/:userWallet',
  asyncHandler(PredictionsController.getUserPredictions)
);

router.post(
  '/:id/claim',
  validateRequest(claimRewardSchema),
  asyncHandler(PredictionsController.claimReward)
);

export default router;