import { Router } from 'express';
import { UsersController } from '../controllers/users.controller';
import { validateRequest, userRegisterSchema } from '../utils/validator';
import { asyncHandler } from '../utils/errorHandler';

const router = Router();

router.post(
  '/register',
  validateRequest(userRegisterSchema),
  asyncHandler(UsersController.register)
);

router.get(
  '/:walletAddress',
  asyncHandler(UsersController.getProfile)
);

export default router;