const express = require('express');
const router  = express.Router();
const sc      = require('../controllers/miscControllers');
const { authenticate, authorize } = require('../middleware/auth');
const guard   = [authenticate, authorize('admin')];

router.get('/',                 ...guard, sc.getSLARules);
router.put('/:id',              ...guard, sc.updateSLARule);

module.exports = router;
