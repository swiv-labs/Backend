import { Router } from 'express';
import { PoolsController } from '../controllers/pools.controller';
import { validateRequest, createPoolSchema, finalizePoolSchema } from '../utils/validator';
import { asyncHandler } from '../utils/errorHandler';

const router = Router();

router.get('/', asyncHandler(PoolsController.getAllPools));
router.get('/:id', asyncHandler(PoolsController.getPoolById));
router.post(
  '/create',
  validateRequest(createPoolSchema),
  asyncHandler(PoolsController.createPool)
);
router.post(
  '/:id/close',
  validateRequest(finalizePoolSchema),
  asyncHandler(PoolsController.closePool)
);
router.post(
  '/:id/finalize',
  asyncHandler(PoolsController.finalizePool)
);

export default router;