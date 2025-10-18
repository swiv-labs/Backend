import { Router } from 'express';
import { LeaderboardController } from '../controllers/leaderboard.controller';
import { asyncHandler } from '../utils/errorHandler';

const router = Router();

router.get('/', asyncHandler(LeaderboardController.getLeaderboard));
router.get('/:walletAddress', asyncHandler(LeaderboardController.getUserStats));

export default router;