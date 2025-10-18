import { Router } from 'express';
import { StatsController } from '../controllers/stats.controller';
import { asyncHandler } from '../utils/errorHandler';

const router = Router();

router.get('/platform', asyncHandler(StatsController.getPlatformStats));
router.get('/assets', asyncHandler(StatsController.getAssetStats));

export default router;