const express = require('express');
const router  = express.Router();
const uc      = require('../controllers/miscControllers');
const { authenticate, authorize } = require('../middleware/auth');
const guard   = [authenticate, authorize('admin')];

router.get('/',                 ...guard, uc.getAllUsers);
router.post('/officer',         ...guard, uc.createOfficer);
router.patch('/:id/toggle',     ...guard, uc.toggleUserStatus);

module.exports = router;