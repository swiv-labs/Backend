import { Router } from 'express';
import { PredictionsController } from '../controllers/predictions.controller';
import { validateRequest, createPredictionSchema, claimRewardSchema } from '../utils/validator';
import { asyncHandler } from '../utils/errorHandler';

const router = Router();

router.post(
  '/',
  // validateRequest(createPredictionSchema),
  asyncHandler(PredictionsController.placeBet)
);

router.get(
  '/:userWallet',
  asyncHandler(PredictionsController.getUserBets)
);

router.post(
  '/:id/claim',
  validateRequest(claimRewardSchema),
  asyncHandler(PredictionsController.claimReward)
);

export default router;